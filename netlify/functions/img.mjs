/*
 * GET /img/<slot>
 * Serves the image uploaded in /admin for that slot, or the default file from /assets.
 * Cached briefly (60s browser, short CDN) so a new upload shows up within about a minute.
 */
import { getStore } from '@netlify/blobs';
import { SLOTS } from '../../lib/slots.mjs';

const CACHE = {
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  'X-Content-Type-Options': 'nosniff',
};

export default async (req, context) => {
  const slot = (context.params && context.params.slot) || new URL(req.url).pathname.split('/').pop();
  const def = SLOTS[slot];
  if (!def) return new Response('Not found', { status: 404 });

  try {
    const store = getStore({ name: 'site-images', consistency: 'strong' });
    const entry = await store.getWithMetadata(slot, { type: 'arrayBuffer' });
    if (entry && entry.data) {
      const etag = '"' + ((entry.metadata && entry.metadata.updated) || entry.etag || 'x').toString().replace(/"/g, '') + '"';
      if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ...CACHE, ETag: etag } });
      return new Response(entry.data, {
        status: 200,
        headers: { ...CACHE, ETag: etag, 'Content-Type': (entry.metadata && entry.metadata.type) || def.format },
      });
    }
  } catch (err) {
    console.error('[img] blob read failed, serving default:', err.message);
  }

  // Nothing uploaded: pass through the default static file
  const r = await fetch(new URL(def.defaultFile, req.url));
  if (!r.ok) return new Response('Not found', { status: 404 });
  return new Response(r.body, {
    status: 200,
    headers: { ...CACHE, 'Content-Type': r.headers.get('content-type') || def.format },
  });
};

export const config = { path: '/img/:slot' };
