function requireAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.UPLOAD_TOKEN}`;
  if (!env.UPLOAD_TOKEN || header !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function todayInNewYork() {
  // en-CA gives YYYY-MM-DD directly.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export { requireAuth, slugify, todayInNewYork, json };
