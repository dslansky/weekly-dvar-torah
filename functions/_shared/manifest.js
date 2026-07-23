const MANIFEST_KEY = 'manifest.json';

async function readManifest(bucket) {
  const obj = await bucket.get(MANIFEST_KEY);
  if (!obj) return { updated: null, entries: [] };
  try {
    return await obj.json();
  } catch {
    return { updated: null, entries: [] };
  }
}

async function writeManifest(bucket, manifest, nowIso) {
  manifest.updated = nowIso;
  await bucket.put(MANIFEST_KEY, JSON.stringify(manifest, null, 2), {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=300',
    },
  });
}

export { MANIFEST_KEY, readManifest, writeManifest };
