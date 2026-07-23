export async function onRequestGet({ params, request, env }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const key = `audio/${path}`;

  const range = request.headers.get('range');
  const obj = await env.BUCKET.get(key, range ? { range: parseRange(range) } : undefined);

  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('content-type', 'audio/mp4');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('accept-ranges', 'bytes');
  headers.set('etag', obj.httpEtag);

  if (range && obj.range) {
    const { offset, length } = obj.range;
    const total = obj.size;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${total}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

function parseRange(rangeHeader) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) return undefined;
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  return end !== undefined ? { offset, length: end - offset + 1 } : { offset };
}
