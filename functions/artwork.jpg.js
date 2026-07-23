export async function onRequestGet({ env }) {
  const obj = await env.BUCKET.get('artwork.jpg');
  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(obj.body, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: obj.httpEtag,
    },
  });
}
