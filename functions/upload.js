import { lookupParsha } from './_shared/parsha-data.js';
import { readManifest, writeManifest } from './_shared/manifest.js';
import { buildFeedXml, BASE_URL } from './_shared/feed.js';
import { getM4ADurationSeconds } from './_shared/mp4-duration.js';
import { requireAuth, slugify, todayInNewYork, json } from './_shared/util.js';

const ALLOWED_TYPES = new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac']);

export async function onRequestPost({ request, env }) {
  const unauthorized = requireAuth(request, env);
  if (unauthorized) return unauthorized;

  const contentType = request.headers.get('content-type') || '';
  const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

  let parsha;
  let title;
  let dateInput;
  let notes;
  let durationHint;
  let buffer;

  if (isMultipart) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: 'expected multipart/form-data' }, 400);
    }

    const file = form.get('file');
    parsha = form.get('parsha');
    title = form.get('title');
    dateInput = form.get('date');
    notes = form.get('notes') || '';
    durationHint = form.get('durationSec');

    if (!file || typeof file === 'string') {
      return json({ ok: false, error: 'missing file' }, 400);
    }
    if (!parsha) {
      return json({ ok: false, error: 'missing parsha' }, 400);
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return json({ ok: false, error: `unsupported file type: ${file.type}` }, 400);
    }

    buffer = await file.arrayBuffer();
  } else {
    // Raw-body mode: the entire request body is the audio, metadata comes
    // from headers. Simpler for callers that can't build multipart bodies.
    parsha = request.headers.get('x-parsha');
    title = request.headers.get('x-title');
    dateInput = request.headers.get('x-date');
    notes = request.headers.get('x-notes') || '';
    durationHint = undefined;

    if (!parsha) {
      return json({ ok: false, error: 'missing X-Parsha header' }, 400);
    }
    if (contentType && !ALLOWED_TYPES.has(contentType.toLowerCase())) {
      return json({ ok: false, error: `unsupported file type: ${contentType}` }, 400);
    }

    buffer = await request.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return json({ ok: false, error: 'missing request body (audio bytes)' }, 400);
    }
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateInput || '') ? dateInput : todayInNewYork();
  const slug = slugify(parsha);
  const id = `${date}-${slug}`;
  const audioKey = `audio/${id}.m4a`;

  let durationSec = null;
  try {
    durationSec = getM4ADurationSeconds(buffer);
  } catch {
    durationSec = null;
  }
  if (!durationSec && durationHint) {
    const parsed = Number(durationHint);
    if (Number.isFinite(parsed) && parsed > 0) durationSec = Math.round(parsed);
  }

  await env.BUCKET.put(audioKey, buffer, {
    httpMetadata: {
      contentType: 'audio/mp4',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const { parshaHebrew, sefer } = lookupParsha(parsha);

  const entry = {
    id,
    date,
    parsha,
    parshaHebrew,
    sefer,
    title: title || `Parshas ${parsha}`,
    notes,
    audio: `${BASE_URL}/${audioKey}`,
    bytes: buffer.byteLength,
    durationSec: durationSec ?? undefined,
  };

  const manifest = await readManifest(env.BUCKET);
  manifest.entries = manifest.entries || [];
  manifest.entries = manifest.entries.filter((e) => e.id !== id);
  manifest.entries.unshift(entry);
  manifest.entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const nowIso = new Date().toISOString();
  await writeManifest(env.BUCKET, manifest, nowIso);

  const feedXml = buildFeedXml(manifest);
  await env.BUCKET.put('feed.xml', feedXml, {
    httpMetadata: {
      contentType: 'application/rss+xml; charset=utf-8',
      cacheControl: 'public, max-age=300',
    },
  });

  return json({ ok: true, url: `${BASE_URL}/#${id}`, entry });
}
