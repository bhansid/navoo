/*
 * POST /api/subscribe
 * 1. Validates the email (+ honeypot for bots)
 * 2. Saves it to Google Sheets via the Apps Script web app (de-duplicates there)
 * 3. For new sign-ups, sends a "Lead" to Meta Conversions API (same event_id as the browser Pixel → de-duplicated)
 *
 * Env vars: SHEETS_WEBHOOK_URL, SHEETS_SECRET, META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE (optional)
 */
import { createHash, randomUUID } from 'node:crypto';

const env = k => ((globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || '').trim();
const META_API_VERSION = 'v21.0';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const clip = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');
const sha256 = s => createHash('sha256').update(s).digest('hex');

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// Best-effort rate limit (per function instance; good enough to slow down simple abuse)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), b = hits.get(ip);
  if (!b || now > b.reset) { hits.set(ip, { n: 1, reset: now + 10 * 60_000 }); return false; }
  return ++b.n > 8;
}

async function saveToSheet(row) {
  const url = env('SHEETS_WEBHOOK_URL');
  if (!url) throw new Error('SHEETS_WEBHOOK_URL not configured');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script reads e.postData.contents
    body: JSON.stringify({ secret: env('SHEETS_SECRET'), row }),
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
  });
  const text = await r.text();
  let out; try { out = JSON.parse(text); } catch { throw new Error('Sheet script returned non-JSON (check deployment access is "Anyone"): ' + text.slice(0, 120)); }
  if (!out.ok) throw new Error('Sheet script error: ' + (out.error || 'unknown'));
  return out; // { ok, duplicate }
}

async function sendMetaLead(row, ip, ua) {
  const pixel = env('META_PIXEL_ID'), token = env('META_CAPI_TOKEN');
  if (!pixel || !token) return 'off';
  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: row.event_id,
      action_source: 'website',
      event_source_url: row.page_url || undefined,
      user_data: {
        em: [sha256(row.email)],
        client_ip_address: ip || undefined,
        client_user_agent: ua || undefined,
        fbp: row.fbp || undefined,
        fbc: row.fbc || undefined,
      },
      custom_data: { content_name: 'Navoo waitlist', form_location: row.form_location || undefined },
    }],
  };
  if (env('META_TEST_EVENT_CODE')) payload.test_event_code = env('META_TEST_EVENT_CODE');
  const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b.error && b.error.message) || 'HTTP ' + r.status); }
  return 'sent';
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';
  if (limited(ip)) return json(429, { error: 'Too many attempts. Please try again in a few minutes.' });

  const raw = await req.text();
  if (raw.length > 16_000) return json(413, { error: 'Payload too large' });
  let b; try { b = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'Invalid request' }); }

  if (b.company) return json(200, { ok: true }); // honeypot filled = bot; pretend success
  const email = clip(String(b.email || '').trim().toLowerCase(), 254);
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.' });

  const ua = req.headers.get('user-agent') || '';
  const a = (b.attribution && typeof b.attribution === 'object') ? b.attribution : {};
  const row = {
    email,
    form_location: clip(b.form_location, 30),
    utm_source: clip(a.utm_source, 120), utm_medium: clip(a.utm_medium, 120), utm_campaign: clip(a.utm_campaign, 200),
    utm_content: clip(a.utm_content, 200), utm_term: clip(a.utm_term, 200),
    fbclid: clip(a.fbclid, 300), gclid: clip(a.gclid, 300),
    referrer: clip(a.referrer, 500), landing_page: clip(a.landing_page, 500), page_url: clip(b.page_url, 500),
    device: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
    country: clip(context && context.geo && context.geo.country && context.geo.country.code, 4),
    event_id: /^[A-Za-z0-9-]{8,64}$/.test(b.event_id || '') ? b.event_id : randomUUID(),
    fbp: clip(b.fbp, 120), fbc: clip(b.fbc, 400),
  };

  let saved;
  try { saved = await saveToSheet(row); }
  catch (err) {
    console.error('[sheet]', err.message);
    return json(502, { error: 'We couldn’t save your sign-up just now. Please try again in a moment.' });
  }
  if (saved.duplicate) return json(200, { ok: true, duplicate: true });

  try { await sendMetaLead(row, ip, ua); } catch (err) { console.error('[capi]', err.message); } // never block the user on this

  return json(201, { ok: true, duplicate: false });
};

export const config = { path: '/api/subscribe' };
