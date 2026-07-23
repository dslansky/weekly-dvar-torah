export async function onRequestGet({ env }) {
  const obj = await env.BUCKET.get('manifest.json');
  if (!obj) {
    return new Response(JSON.stringify({ updated: null, entries: [] }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      },
    });
  }

  return new Response(obj.body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
      etag: obj.httpEtag,
    },
  });
}
