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

// Trims, drops empties, and dedupes case-insensitively while preserving the
// casing of whichever occurrence came first (so "Bitachon" typed once stays
// "Bitachon" everywhere, even if a later "bitachon" is entered by mistake).
function normalizeTags(tags) {
  const seen = new Map(); // lowercase -> first-seen original casing
  for (const raw of Array.isArray(tags) ? tags : []) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return Array.from(seen.values());
}

export { requireAuth, slugify, todayInNewYork, json, normalizeTags };
