(function () {
  'use strict';

  const SEFER_ORDER = ['Bereishis', 'Shemos', 'Vayikra', 'Bamidbar', 'Devarim', 'Moadim'];
  const SEFER_HEBREW = {
    Bereishis: 'בראשית',
    Shemos: 'שמות',
    Vayikra: 'ויקרא',
    Bamidbar: 'במדבר',
    Devarim: 'דברים',
    Moadim: 'מועדים',
  };
  const SEARCH_MIN_ENTRIES = 5;

  const root = document.getElementById('archive-root');
  const searchInput = document.getElementById('search-input');
  const searchRow = document.getElementById('search-row');

  let allEntries = [];
  let activeAudio = null; // { audioEl, article }
  let preSearchOpenState = null; // Map<details, boolean> | null — snapshot taken when a search begins

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

    if (searchRow) searchRow.hidden = allEntries.length < SEARCH_MIN_ENTRIES;

    render(allEntries);
    wireSearch();
    wirePermalink();
  }

  function render(entries) {
    if (!entries.length) {
      root.innerHTML = '<p class="empty-line">No entries yet — check back after this week’s recording.</p>';
      return;
    }

    const mostRecent = entries.reduce((latest, e) => (!latest || e.date > latest.date ? e : latest), null);

    const groups = groupBySefer(entries);
    warnDuplicateParshaInCycle(groups);

    const frag = document.createDocumentFragment();
    frag.appendChild(renderLatestCard(mostRecent));

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
      // Newest reading-cycle first; within a cycle, ascending date — which
      // is the actual Torah reading order (Bereishis before Noach before
      // Lech Lecha, ...), not a raw date-descending shuffle that jumps
      // between cycles and reads as random.
      list.sort((a, b) => {
        const ca = cycleYear(a.date);
        const cb = cycleYear(b.date);
        if (ca !== cb) return cb - ca;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
    }
    return groups;
  }

  // Same parsha appearing twice within one reading cycle almost always means
  // a filename got parsed wrong upstream (see backfill/parse-filenames.mjs) —
  // surface it loudly rather than silently rendering a confusing duplicate.
  function warnDuplicateParshaInCycle(groups) {
    for (const [sefer, list] of groups) {
      const seenByCycle = new Map(); // cycleYear -> Set<normalized parsha>
      for (const e of list) {
        const cy = cycleYear(e.date);
        const key = normalizeSearch(e.parsha);
        if (!seenByCycle.has(cy)) seenByCycle.set(cy, new Set());
        const seen = seenByCycle.get(cy);
        if (seen.has(key)) {
          console.warn(
            `[archive] Duplicate parsha "${e.parsha}" in ${sefer} for cycle ${cycleLabel(cy)} ` +
              `(entry id: ${e.id}) — likely a filename parse error upstream.`
          );
        }
        seen.add(key);
      }
    }
  }

  // Simchas Torah (when the reading cycle actually restarts at Bereishis)
  // lands anywhere from late September to late October depending on the
  // Hebrew year, so a fixed Gregorian-month cutoff misbuckets late-Elul
  // parshiyos (Shoftim..Nitzavim/Vayeilech/Haazinu) in years where Simchas
  // Torah falls late — e.g. Shoftim on 2024-09-06 is still the tail of the
  // 2023-2024 cycle (Simchas Torah 2024 wasn't until Oct 25), not the start
  // of a new one. Sourced from hebcal.com. Extend the table as years pass.
  const SIMCHAS_TORAH = {
    2020: '2020-10-11', 2021: '2021-09-29', 2022: '2022-10-18', 2023: '2023-10-08',
    2024: '2024-10-25', 2025: '2025-10-15', 2026: '2026-10-04', 2027: '2027-10-24',
    2028: '2028-10-13', 2029: '2029-10-02', 2030: '2030-10-20', 2031: '2031-10-10',
    2032: '2032-09-28', 2033: '2033-10-16', 2034: '2034-10-06', 2035: '2035-10-26',
    2036: '2036-10-14', 2037: '2037-10-02', 2038: '2038-10-22', 2039: '2039-10-11',
    2040: '2040-09-30',
  };

  function cycleYear(iso) {
    const isoStr = String(iso);
    const y = Number(isoStr.slice(0, 4));
    const simchasTorah = SIMCHAS_TORAH[y];
    if (simchasTorah) return isoStr >= simchasTorah ? y : y - 1;
    // Outside the lookup table: fall back to a rough Sep/Oct cutoff.
    const m = Number(isoStr.slice(5, 7));
    return m >= 9 ? y : y - 1;
  }

  function cycleLabel(cy) {
    return `${cy}–${String(cy + 1).slice(-2)}`;
  }

  // Gregorian cycle-start year -> Hebrew year (e.g. 2025 -> 5786). Rosh
  // Hashana always falls within the Sep/Oct window cycleYear() already keys
  // off of, so a fixed +3761 offset is safe for this display-only label.
  function hebrewYearLabel(cy) {
    return formatHebrewNumeral((cy + 3761) % 1000);
  }

  // Traditional Hebrew numeral (gematria) for a 1-999 value, with the
  // standard טו/טז substitution for 15/16 and gershayim before the final
  // letter (or geresh after a single letter).
  function formatHebrewNumeral(n) {
    const VALUES = [
      [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'],
      [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
      [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
    ];
    let remaining = n;
    const letters = [];
    while (remaining > 0) {
      if (remaining === 15) {
        letters.push('ט', 'ו');
        break;
      }
      if (remaining === 16) {
        letters.push('ט', 'ז');
        break;
      }
      const [val, letter] = VALUES.find(([v]) => remaining >= v);
      letters.push(letter);
      remaining -= val;
    }
    if (!letters.length) return '';
    if (letters.length === 1) return letters[0] + '׳';
    return letters.slice(0, -1).join('') + '״' + letters[letters.length - 1];
  }

  function renderLatestCard(entry) {
    const wrap = document.createElement('div');
    wrap.className = 'latest-block';

    const label = document.createElement('div');
    label.className = 'latest-label';
    label.textContent = 'Latest';
    wrap.appendChild(label);

    const ul = document.createElement('ul');
    ul.className = 'shelf-list latest-list';

    const li = renderEntry(entry);
    // Distinct id from the in-shelf copy so getElementById(permalink) still
    // resolves to the real, shelved instance.
    li.id = `latest-${entry.id}`;
    ul.appendChild(li);

    wrap.appendChild(ul);
    return wrap;
  }

  function renderShelf(sefer, entries) {
    const details = document.createElement('details');
    details.className = 'shelf';
    details.dataset.sefer = sefer;

    const summary = document.createElement('summary');

    const caret = document.createElement('span');
    caret.className = 'shelf-caret';
    caret.setAttribute('aria-hidden', 'true');
    summary.appendChild(caret);

    const title = document.createElement('h2');
    title.className = 'shelf-title';
    title.innerHTML = `
      <span class="shelf-name">${escapeHtml(sefer)}</span><span class="shelf-count">${entries.length}</span>
      <span class="shelf-hebrew" lang="he" dir="rtl">${escapeHtml(SEFER_HEBREW[sefer] || '')}</span>
    `;
    summary.appendChild(title);

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'shelf-list';

    let lastCycle = null;
    for (const entry of entries) {
      const cy = cycleYear(entry.date);
      if (cy !== lastCycle) {
        ul.appendChild(renderCycleBreak(cy));
        lastCycle = cy;
      }
      ul.appendChild(renderEntry(entry));
    }

    details.appendChild(ul);
    return details;
  }

  function renderCycleBreak(cy) {
    const li = document.createElement('li');
    li.className = 'cycle-break';
    li.setAttribute('aria-hidden', 'true');
    li.innerHTML = `<span class="cycle-hebrew" lang="he" dir="rtl">${escapeHtml(hebrewYearLabel(cy))}</span> &middot; <span class="cycle-secular">${escapeHtml(cycleLabel(cy))}</span>`;
    return li;
  }

  function renderEntry(entry) {
    const li = document.createElement('li');
    li.id = entry.id;
    li.dataset.parsha = normalizeSearch(entry.parsha + ' ' + (entry.parshaHebrew || ''));

    const durationLabel = entry.durationSec ? formatTime(entry.durationSec) : '—';
    const metaParts = [escapeHtml(entry.parsha), escapeHtml(formatDateUS(entry.date))];

    li.innerHTML = `
      <article class="entry" data-id="${escapeAttr(entry.id)}">
        <button class="entry-play-btn" type="button" aria-label="Play ${escapeAttr(entry.title || entry.parsha)}">
          <svg class="play-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="115 11" />
          </svg>
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
        <div class="entry-side">
          ${entry.durationSec ? `<span class="entry-duration">${escapeHtml(durationLabel)}</span>` : ''}
          <button class="share-btn" type="button" aria-label="Copy permalink">
            <svg class="icon-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 3l-4 4M12 3l4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
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
      shareBtn.classList.add('copied');
      shareBtn.setAttribute('aria-label', 'Copied');
      setTimeout(() => {
        shareBtn.classList.remove('copied');
        shareBtn.setAttribute('aria-label', 'Copy permalink');
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
      const isSearching = q.length > 0;

      if (isSearching && !preSearchOpenState) {
        preSearchOpenState = new Map();
        document.querySelectorAll('details.shelf').forEach((d) => preSearchOpenState.set(d, d.open));
      }

      // Cycle-break <li>s aren't entries (no data-parsha) — hide one if
      // every entry in its chunk got filtered out, otherwise leave it.
      document.querySelectorAll('.shelf-list').forEach((list) => {
        let currentBreak = null;
        let breakHasVisible = false;
        const finalizeBreak = () => {
          if (currentBreak) currentBreak.style.display = breakHasVisible ? '' : 'none';
        };

        Array.from(list.children).forEach((li) => {
          if (li.classList.contains('cycle-break')) {
            finalizeBreak();
            currentBreak = li;
            breakHasVisible = false;
            return;
          }
          const match = !q || li.dataset.parsha.includes(q);
          li.style.display = match ? '' : 'none';
          if (match) breakHasVisible = true;
        });
        finalizeBreak();
      });

      document.querySelectorAll('.shelf').forEach((shelf) => {
        const visible = Array.from(shelf.querySelectorAll('.shelf-list > li:not(.cycle-break)')).some(
          (li) => li.style.display !== 'none'
        );
        shelf.style.display = visible ? '' : 'none';
        if (isSearching && visible) shelf.open = true;
      });

      const latestBlock = document.querySelector('.latest-block');
      if (latestBlock) {
        const latestVisible = Array.from(latestBlock.querySelectorAll('.latest-list > li')).some(
          (li) => li.style.display !== 'none'
        );
        latestBlock.style.display = latestVisible ? '' : 'none';
      }

      if (!isSearching && preSearchOpenState) {
        preSearchOpenState.forEach((wasOpen, shelf) => {
          shelf.open = wasOpen;
        });
        preSearchOpenState = null;
      }
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
    const shelf = el.closest('details.shelf');
    if (shelf && !shelf.open) shelf.open = true;
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
