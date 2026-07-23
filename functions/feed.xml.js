export async function onRequestGet({ env }) {
  const obj = await env.BUCKET.get('feed.xml');
  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(obj.body, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
      etag: obj.httpEtag,
    },
  });
}
