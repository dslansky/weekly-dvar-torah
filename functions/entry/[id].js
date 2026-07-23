import { readManifest, writeManifest } from '../_shared/manifest.js';
import { buildFeedXml } from '../_shared/feed.js';
import { requireAuth, json } from '../_shared/util.js';

export async function onRequestDelete({ request, env, params }) {
  const unauthorized = requireAuth(request, env);
  if (unauthorized) return unauthorized;

  const id = params.id;
  const manifest = await readManifest(env.BUCKET);
  const entries = manifest.entries || [];
  const index = entries.findIndex((e) => e.id === id);

  if (index === -1) {
    return json({ ok: false, error: 'not found' }, 404);
  }

  const [removed] = entries.splice(index, 1);
  manifest.entries = entries;

  await env.BUCKET.delete(`audio/${id}.m4a`);

  const nowIso = new Date().toISOString();
  await writeManifest(env.BUCKET, manifest, nowIso);

  const feedXml = buildFeedXml(manifest);
  await env.BUCKET.put('feed.xml', feedXml, {
    httpMetadata: {
      contentType: 'application/rss+xml; charset=utf-8',
      cacheControl: 'public, max-age=300',
    },
  });

  return json({ ok: true, removed });
}
