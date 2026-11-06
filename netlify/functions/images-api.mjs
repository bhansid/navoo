/*
 * Image settings API
 *   GET    /api/images/config               public: focus point + version per slot (used by the page)
 *   POST   /api/admin/login                 { password } -> { token }
 *   GET    /api/admin/images                list of slots with recommended + current dimensions
 *   PUT    /api/admin/images/:slot          upload (raw image body, headers X-Width / X-Height)
 *   PATCH  /api/admin/images/:slot          { pos } focus point, e.g. "30% 0%"
 *   DELETE /api/admin/images/:slot          reset to the default image
 *
 * Env: ADMIN_PASSWORD (required for admin)
 */
import { getStore } from '@netlify/blobs';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { SLOTS, ALLOWED_TYPES, MAX_BYTES } from '../../lib/slots.mjs';

const env = k => ((globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || '').trim();
const CONFIG_KEY = '__config';
const TOKEN_HOURS = 12;
const POS_RE = /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;

const json = (status, obj, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});
const store = () => getStore({ name: 'site-images', consistency: 'strong' });
async function readConfig(s) { return (await s.get(CONFIG_KEY, { type: 'json' })) || { slots: {} }; }

/* ---------- auth: signed, expiring token derived from ADMIN_PASSWORD ---------- */
const secret = () => createHash('sha256').update('navoo-admin:' + env('ADMIN_PASSWORD')).digest();
const sign = data => createHmac('sha256', secret()).update(data).digest('base64url');
function makeToken() {
  const data = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_HOURS * 3600_000 })).toString('base64url');
  return data + '.' + sign(data);
}
function authed(req) {
  if (!env('ADMIN_PASSWORD')) return false;
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [data, sig] = tok.split('.');
  if (!data || !sig) return false;
  const exp = sign(data);
  if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return false;
  try { return JSON.parse(Buffer.from(data, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), a = attempts.get(ip);
  if (!a || now > a.reset) { attempts.set(ip, { n: 1, reset: now + 15 * 60_000 }); return false; }
  return ++a.n > 8;
}

/* ---------- handlers ---------- */
async function publicConfig() {
  const cfg = await readConfig(store());
  const out = {};
  for (const [k, v] of Object.entries(cfg.slots || {})) out[k] = { pos: v.pos || null, v: v.updated || null };
  return json(200, out, { 'Cache-Control': 'public, max-age=60', 'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
}

async function list() {
  const cfg = await readConfig(store());
  const slots = Object.entries(SLOTS).filter(([, d]) => !d.hidden).map(([key, d]) => {
    const c = (cfg.slots || {})[key] || {};
    return {
      key, label: d.label, where: d.where, shown: d.shown, tip: d.tip || '', rec: d.rec, fit: d.fit, format: d.format,
      defaultPos: d.defaultPos, pos: c.pos || d.defaultPos,
      custom: !!c.updated, width: c.width || null, height: c.height || null, bytes: c.bytes || null, updated: c.updated || null,
    };
  });
  return json(200, { slots });
}

async function upload(req, slot) {
  const def = SLOTS[slot];
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!ALLOWED_TYPES.includes(type)) return json(415, { error: 'Only WebP, PNG or JPEG images.' });
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return json(400, { error: 'Empty file.' });
  if (buf.byteLength > MAX_BYTES) return json(413, { error: 'Image is too large (max 4 MB after resizing).' });
  const width = Math.min(10000, parseInt(req.headers.get('x-width'), 10) || 0);
  const height = Math.min(10000, parseInt(req.headers.get('x-height'), 10) || 0);
  const updated = Date.now();
  const s = store();
  await s.set(slot, buf, { metadata: { type, width, height, bytes: buf.byteLength, updated } });
  const cfg = await readConfig(s);
  cfg.slots = cfg.slots || {};
  cfg.slots[slot] = { ...(cfg.slots[slot] || {}), width, height, bytes: buf.byteLength, updated, type };
  await s.setJSON(CONFIG_KEY, cfg);
  return json(200, { ok: true, slot, width, height, bytes: buf.byteLength, updated, label: def.label });
}

async function setPos(req, slot) {
  let b; try { b = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }
  const pos = String(b.pos || '').trim();
  if (!POS_RE.test(pos)) return json(400, { error: 'Focus point must look like "30% 0%".' });
  const s = store();
  const cfg = await readConfig(s);
  cfg.slots = cfg.slots || {};
  cfg.slots[slot] = { ...(cfg.slots[slot] || {}), pos };
  await s.setJSON(CONFIG_KEY, cfg);
  return json(200, { ok: true, pos });
}

async function reset(slot) {
  const s = store();
  await s.delete(slot);
  if (slot === 'mark') await s.delete('mark-white');
  const cfg = await readConfig(s);
  if (cfg.slots) { delete cfg.slots[slot]; if (slot === 'mark') delete cfg.slots['mark-white']; }
  await s.setJSON(CONFIG_KEY, cfg);
  return json(200, { ok: true });
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  try {
    if (path === '/api/images/config' && req.method === 'GET') return await publicConfig();

    if (path === '/api/admin/login' && req.method === 'POST') {
      if (!env('ADMIN_PASSWORD')) return json(503, { error: 'Admin is off. Add ADMIN_PASSWORD in Netlify environment variables, then redeploy.' });
      const ip = (context && context.ip) || 'x';
      if (tooMany(ip)) return json(429, { error: 'Too many attempts. Wait 15 minutes.' });
      let b; try { b = await req.json(); } catch { b = {}; }
      const a = createHash('sha256').update(String(b.password || '')).digest();
      const e = createHash('sha256').update(env('ADMIN_PASSWORD')).digest();
      if (!timingSafeEqual(a, e)) return json(401, { error: 'Wrong password.' });
      return json(200, { ok: true, token: makeToken(), hours: TOKEN_HOURS });
    }

    if (!path.startsWith('/api/admin/')) return json(404, { error: 'Not found' });
    if (!authed(req)) return json(401, { error: 'Please sign in again.' });

    if (path === '/api/admin/images' && req.method === 'GET') return await list();

    const m = path.match(/^\/api\/admin\/images\/([a-z-]+)$/);
    if (m) {
      const slot = m[1];
      if (!SLOTS[slot]) return json(404, { error: 'Unknown image.' });
      if (req.method === 'PUT') return await upload(req, slot);
      if (req.method === 'PATCH') return await setPos(req, slot);
      if (req.method === 'DELETE') return await reset(slot);
    }
    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('[images-api]', err);
    return json(500, { error: 'Server error: ' + err.message });
  }
};

export const config = { path: ['/api/images/config', '/api/admin/*'] };
