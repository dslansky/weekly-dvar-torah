(function () {
  'use strict';

  const SEFER_ORDER = ['Bereishis', 'Shemos', 'Vayikra', 'Bamidbar', 'Devarim', 'Moadim'];

  const root = document.getElementById('archive-root');
  const searchInput = document.getElementById('search-input');

  let allEntries = [];
  let activeAudio = null; // { audioEl, li }
  let accessionNumbers = new Map(); // entry.id -> "QTT-001"

  init();

  async function init() {
    try {
      const res = await fetch('/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
      const manifest = await res.json();
      allEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
    } catch (err) {
      root.innerHTML = '<p class="empty-line">Could not load the archive. Try refreshing.</p>';
      console.error(err);
      return;
    }

    accessionNumbers = buildAccessionNumbers(allEntries);
    render(allEntries);
    wireSearch();
    wirePermalink();
  }

  // Stable accession numbers (QTT-001, QTT-002, ...) assigned in chronological
  // order of the recording date — independent of the sefer-grouped display
  // order, so a given entry's number never changes as new ones are added.
  function buildAccessionNumbers(entries) {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
    const map = new Map();
    sorted.forEach((e, i) => map.set(e.id, `QTT-${String(i + 1).padStart(3, '0')}`));
    return map;
  }

  function render(entries) {
    if (!entries.length) {
      root.innerHTML = '<p class="empty-line">No entries yet — check back after this week’s recording.</p>';
      return;
    }

    const groups = groupBySefer(entries);
    const frag = document.createDocumentFragment();

    for (const sefer of SEFER_ORDER) {
      const list = groups.get(sefer);
      if (!list || !list.length) continue;
      frag.appendChild(renderShelf(sefer, list));
    }

    root.innerHTML = '';
    root.appendChild(frag);

    // If a permalink hash is already present, highlight it once rendered.
    if (location.hash.length > 1) {
      scrollToEntry(location.hash.slice(1), false);
    }
  }

  function groupBySefer(entries) {
    const groups = new Map();
    for (const e of entries) {
      const sefer = SEFER_ORDER.includes(e.sefer) ? e.sefer : 'Moadim';
      if (!groups.has(sefer)) groups.set(sefer, []);
      groups.get(sefer).push(e);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }
    return groups;
  }

  function renderShelf(sefer, entries) {
    const section = document.createElement('section');
    section.className = 'shelf';
    section.dataset.sefer = sefer;

    const title = document.createElement('h2');
    title.className = 'shelf-title';
    title.innerHTML = `<span class="shelf-name">${escapeHtml(sefer)}</span> <span class="shelf-count">(${entries.length})</span>`;
    section.appendChild(title);

    const ul = document.createElement('ul');
    ul.className = 'shelf-list';

    for (const entry of entries) {
      ul.appendChild(renderEntry(entry));
    }

    section.appendChild(ul);
    return section;
  }

  function renderEntry(entry) {
    const li = document.createElement('li');
    li.id = entry.id;
    li.dataset.parsha = normalizeSearch(entry.parsha + ' ' + (entry.parshaHebrew || ''));

    const durationLabel = entry.durationSec ? formatTime(entry.durationSec) : '—';
    const metaParts = [escapeHtml(entry.parsha), escapeHtml(formatDateUS(entry.date))];
    if (entry.durationSec) metaParts.push(escapeHtml(durationLabel));
    const accession = accessionNumbers.get(entry.id) || '';

    li.innerHTML = `
      <article class="entry" data-id="${escapeAttr(entry.id)}">
        <button class="entry-play-btn" type="button" aria-label="Play ${escapeAttr(entry.title || entry.parsha)}">
          <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><polygon points="8,5 20,12 8,19" /></svg>
          <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
        </button>
        <div class="entry-body">
          <div class="entry-hebrew" lang="he" dir="rtl" data-fallback="${escapeAttr(entry.parsha)}">${escapeHtml(entry.parshaHebrew || '')}</div>
          <div class="entry-meta">${metaParts.join(' &middot; ')}</div>
          ${entry.notes ? `<div class="entry-notes">${escapeHtml(entry.notes)}</div>` : ''}
          <div class="entry-scrub">
            <input type="range" class="entry-range" min="0" max="100" value="0" step="0.1" aria-label="Seek" />
            <span class="entry-time">0:00 / ${escapeHtml(durationLabel)}</span>
          </div>
        </div>
        <div class="entry-actions">
          <span class="catalog-id">${escapeHtml(accession)}</span>
          <button class="share-btn" type="button" data-id="${escapeAttr(entry.id)}">share</button>
        </div>
      </article>
    `;

    const article = li.querySelector('.entry');
    const playBtn = li.querySelector('.entry-play-btn');
    const range = li.querySelector('.entry-range');
    const timeLabel = li.querySelector('.entry-time');
    const shareBtn = li.querySelector('.share-btn');

    let audioEl = null;

    playBtn.addEventListener('click', () => {
      if (!audioEl) {
        audioEl = new Audio(entry.audio);
        audioEl.preload = 'none';

        audioEl.addEventListener('loadedmetadata', () => {
          if (isFinite(audioEl.duration)) {
            range.max = String(audioEl.duration);
            timeLabel.textContent = `0:00 / ${formatTime(audioEl.duration)}`;
          }
        });

        audioEl.addEventListener('timeupdate', () => {
          range.value = String(audioEl.currentTime);
          const total = isFinite(audioEl.duration) ? audioEl.duration : entry.durationSec || 0;
          timeLabel.textContent = `${formatTime(audioEl.currentTime)} / ${formatTime(total)}`;
        });

        audioEl.addEventListener('ended', () => {
          setPlayingState(article, false);
        });
      }

      if (activeAudio && activeAudio.audioEl !== audioEl) {
        activeAudio.audioEl.pause();
        setPlayingState(activeAudio.article, false);
      }

      if (audioEl.paused) {
        audioEl.play();
        setPlayingState(article, true);
        activeAudio = { audioEl, article };
      } else {
        audioEl.pause();
        setPlayingState(article, false);
      }
    });

    range.addEventListener('input', () => {
      if (audioEl) audioEl.currentTime = Number(range.value);
    });

    shareBtn.addEventListener('click', async () => {
      const url = `${location.origin}/#${entry.id}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt('Copy this link:', url);
      }
      shareBtn.textContent = 'copied';
      shareBtn.classList.add('copied');
      setTimeout(() => {
        shareBtn.textContent = 'share';
        shareBtn.classList.remove('copied');
      }, 1400);
    });

    return li;
  }

  function setPlayingState(article, isPlaying) {
    article.classList.toggle('is-playing', isPlaying);
    article.classList.toggle('is-active', true);
    const btn = article.querySelector('.entry-play-btn');
    if (btn) {
      const label = isPlaying ? 'Pause' : 'Play';
      btn.setAttribute('aria-label', label);
    }
  }

  function wireSearch() {
    searchInput.addEventListener('input', () => {
      const q = normalizeSearch(searchInput.value);
      document.querySelectorAll('.shelf-list > li').forEach((li) => {
        const match = !q || li.dataset.parsha.includes(q);
        li.style.display = match ? '' : 'none';
      });
      document.querySelectorAll('.shelf').forEach((section) => {
        const visible = Array.from(section.querySelectorAll('.shelf-list > li')).some(
          (li) => li.style.display !== 'none'
        );
        section.style.display = visible ? '' : 'none';
      });
    });
  }

  function wirePermalink() {
    window.addEventListener('hashchange', () => {
      if (location.hash.length > 1) scrollToEntry(location.hash.slice(1), true);
    });
  }

  function scrollToEntry(id, smooth) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    const article = el.querySelector('.entry');
    if (!article) return;
    article.classList.remove('is-target');
    // Force reflow so the animation restarts if the same hash is re-triggered.
    void article.offsetWidth;
    article.classList.add('is-target');
  }

  function normalizeSearch(str) {
    return String(str || '').toLowerCase().trim();
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // "2026-07-23" -> "July 23, 2026". Built from UTC components so the
  // displayed date never shifts based on the viewer's local timezone.
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
