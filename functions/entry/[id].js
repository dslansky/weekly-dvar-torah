import { readManifest, writeManifest } from '../_shared/manifest.js';
import { buildFeedXml } from '../_shared/feed.js';
import { requireAuth, json, normalizeTags } from '../_shared/util.js';

// Fields safe to edit after the fact. Deliberately excludes date/parsha/
// sefer/audio/etc — those are baked into the id and the R2 audio key, so
// changing them is still a DELETE + re-upload operation, not a PATCH.
const EDITABLE_FIELDS = ['tags', 'notes', 'title'];

export async function onRequestPatch({ request, env, params }) {
  const unauthorized = requireAuth(request, env);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'expected JSON body' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'expected JSON body' }, 400);
  }

  const manifest = await readManifest(env.BUCKET);
  const entries = manifest.entries || [];
  const entry = entries.find((e) => e.id === params.id);
  if (!entry) {
    return json({ ok: false, error: 'not found' }, 404);
  }

  const patch = {};
  for (const key of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;

    if (key === 'tags') {
      if (!Array.isArray(body.tags)) {
        return json({ ok: false, error: 'tags must be an array of strings' }, 400);
      }
      patch.tags = normalizeTags(body.tags);
      continue;
    }

    if (typeof body[key] !== 'string') {
      return json({ ok: false, error: `${key} must be a string` }, 400);
    }
    const trimmed = body[key].trim();
    if (key === 'title' && !trimmed) {
      return json({ ok: false, error: 'title cannot be empty' }, 400);
    }
    patch[key] = trimmed;
  }

  if (!Object.keys(patch).length) {
    return json({ ok: false, error: 'no editable fields provided (tags, notes, title)' }, 400);
  }

  Object.assign(entry, patch);
  manifest.entries = entries;

  const nowIso = new Date().toISOString();
  await writeManifest(env.BUCKET, manifest, nowIso);

  const feedXml = buildFeedXml(manifest);
  await env.BUCKET.put('feed.xml', feedXml, {
    httpMetadata: {
      contentType: 'application/rss+xml; charset=utf-8',
      cacheControl: 'public, max-age=300',
    },
  });

  return json({ ok: true, entry });
}

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
