(function () {
  'use strict';

  const TOKEN_KEY = 'qtt_admin_token';

  const tokenInput = document.getElementById('token-input');
  const filterInput = document.getElementById('admin-filter');
  const root = document.getElementById('admin-root');
  const tagSuggestions = document.getElementById('tag-suggestions');

  let allEntries = [];

  tokenInput.value = localStorage.getItem(TOKEN_KEY) || '';
  tokenInput.addEventListener('change', () => {
    localStorage.setItem(TOKEN_KEY, tokenInput.value);
  });

  init();

  async function init() {
    try {
      const res = await fetch('/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
      const manifest = await res.json();
      allEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
    } catch (err) {
      root.innerHTML = '<p class="admin-status">Could not load manifest. Try refreshing.</p>';
      console.error(err);
      return;
    }

    allEntries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    refreshTagSuggestions();
    render(allEntries);
    wireFilter();
  }

  function refreshTagSuggestions() {
    const seen = new Map(); // lowercase -> first-seen casing
    for (const e of allEntries) {
      for (const t of e.tags || []) {
        const key = t.toLowerCase();
        if (!seen.has(key)) seen.set(key, t);
      }
    }
    const tags = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
    tagSuggestions.innerHTML = tags.map((t) => `<option value="${escapeAttr(t)}"></option>`).join('');
  }

  function render(entries) {
    if (!entries.length) {
      root.innerHTML = '<p class="admin-status">No entries.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Date</th>
          <th>Parsha</th>
          <th>Title</th>
          <th>Notes</th>
          <th>Tags</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    for (const entry of entries) {
      tbody.appendChild(renderRow(entry));
    }

    root.innerHTML = '';
    root.appendChild(table);
  }

  function renderRow(entry) {
    const tr = document.createElement('tr');
    tr.dataset.id = entry.id;
    tr.dataset.search = normalizeSearch(
      [entry.parsha, entry.parshaHebrew, entry.title, ...(entry.tags || [])].filter(Boolean).join(' ')
    );

    tr.innerHTML = `
      <td class="admin-date">${escapeHtml(formatDateUS(entry.date))}</td>
      <td class="admin-parsha">
        <span class="admin-parsha-he" lang="he" dir="rtl">${escapeHtml(entry.parshaHebrew || '')}</span>
        <span class="admin-parsha-en">${escapeHtml(entry.parsha)}</span>
      </td>
      <td><input type="text" class="admin-input" data-field="title" value="${escapeAttr(entry.title || '')}" /></td>
      <td><input type="text" class="admin-input" data-field="notes" value="${escapeAttr(entry.notes || '')}" /></td>
      <td><input type="text" class="admin-input" data-field="tags" list="tag-suggestions" placeholder="comma, separated" value="${escapeAttr((entry.tags || []).join(', '))}" /></td>
      <td class="admin-actions">
        <button type="button" class="admin-save-btn">Save</button>
        <span class="admin-row-status"></span>
      </td>
    `;

    const saveBtn = tr.querySelector('.admin-save-btn');
    const statusEl = tr.querySelector('.admin-row-status');
    const titleField = tr.querySelector('[data-field="title"]');
    const notesField = tr.querySelector('[data-field="notes"]');
    const tagsField = tr.querySelector('[data-field="tags"]');

    saveBtn.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) {
        setStatus(statusEl, 'Enter token above', true);
        tokenInput.focus();
        return;
      }

      const titleVal = titleField.value.trim();
      if (!titleVal) {
        setStatus(statusEl, 'Title cannot be empty', true);
        return;
      }

      const notesVal = notesField.value.trim();
      const tags = normalizeTagsClient(tagsField.value.split(','));

      saveBtn.disabled = true;
      setStatus(statusEl, 'Saving…', false);

      try {
        const res = await fetch(`/entry/${encodeURIComponent(entry.id)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ title: titleVal, notes: notesVal, tags }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.ok && body.ok) {
          entry.title = body.entry.title;
          entry.notes = body.entry.notes;
          entry.tags = body.entry.tags || [];
          tagsField.value = entry.tags.join(', ');
          tr.dataset.search = normalizeSearch(
            [entry.parsha, entry.parshaHebrew, entry.title, ...entry.tags].filter(Boolean).join(' ')
          );
          setStatus(statusEl, 'Saved', false, true);
          flashRow(tr);
          refreshTagSuggestions();
        } else if (res.status === 401) {
          setStatus(statusEl, 'Unauthorized — check token', true);
        } else {
          setStatus(statusEl, body.error || 'Save failed', true);
        }
      } catch (err) {
        setStatus(statusEl, 'Network error', true);
        console.error(err);
      } finally {
        saveBtn.disabled = false;
      }
    });

    return tr;
  }

  function flashRow(tr) {
    tr.classList.remove('admin-row-flash');
    void tr.offsetWidth; // restart the animation if it's already run once
    tr.classList.add('admin-row-flash');
  }

  function setStatus(el, message, isError, isOk) {
    el.textContent = message;
    el.className = 'admin-row-status';
    if (isError) el.classList.add('admin-row-status-error');
    if (isOk) el.classList.add('admin-row-status-ok');
  }

  function wireFilter() {
    filterInput.addEventListener('input', () => {
      const q = normalizeSearch(filterInput.value);
      document.querySelectorAll('.admin-table tbody tr').forEach((tr) => {
        const match = !q || tr.dataset.search.includes(q);
        tr.style.display = match ? '' : 'none';
      });
    });
  }

  function normalizeTagsClient(tags) {
    const seen = new Map();
    for (const raw of tags) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
    return Array.from(seen.values());
  }

  function normalizeSearch(str) {
    return String(str || '').toLowerCase().trim();
  }

  // "2026-07-24" -> "July 24, 2026", built from UTC components so it never
  // shifts based on the viewer's local timezone (same approach as app.js).
  function formatDateUS(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!match) return iso;
    const [, y, m, d] = match;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }
})();
