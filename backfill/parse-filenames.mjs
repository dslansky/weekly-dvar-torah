#!/usr/bin/env node
// Scans a folder of old recordings and derives filename,date,parsha rows for
// backfill/upload.mjs, by parsing the date and parsha name directly out of
// each filename (real files are named e.g. "Dvar Torah Korach 6.19.26.m4a").
// Writes backfill.csv for review. Never guesses: any filename whose date or
// parsha can't be confidently determined is left out of the CSV and listed
// as a failure at the end for manual handling.
//
// Special-Shabbos qualifiers (e.g. "Vayelech-Shuva", "Shabbos Chanuka") are
// handled explicitly rather than failing: see SPECIAL_SHABBOS_QUALIFIERS
// below. This is the one path that makes a network call (to hebcal.com),
// only when a qualifier is present but no parsha name is.
//
// Usage:
//   node backfill/parse-filenames.mjs --folder "~/Past Recordings" --out backfill/backfill.csv
//
// Requires Node 18+ (global fetch).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalize, PARSHIYOS } from '../functions/_shared/parsha-data.js';

const CANONICAL_BY_KEY = new Map(PARSHIYOS.map(([en]) => [normalize(en), en]));

// Confident, unambiguous spelling/abbreviation variants seen in this batch
// of filenames — each maps to exactly one possible parsha, so this counts
// as normalization, not guessing. Keyed by normalize()'d raw token.
const ALIASES = {
  'achareimos kedoshim': 'Acharei Mos-Kedoshim', // "AchareiMos-Kedoshim" — missing space before "Mos"
  achrei: 'Acharei Mos', // "Achrei" — dropped "Mos"
  bhaaloscha: 'Behaaloscha', // missing "e"
  'bhar bechukosai': 'Behar-Bechukosai', // missing "e"
  bshalach: 'Beshalach', // missing "e"
  emir: 'Emor', // typo
  shemini: 'Shmini', // "Shemini" vs table's "Shmini" — same word, both instances land in April (Parshas Shmini season, not Shemini Atzeres)
  vaera: 'Vaeira', // spelling variant
  vayeshev: 'Vayeishev', // spelling variant
  vayetzei: 'Vayeitzei', // spelling variant
  vayelech: 'Vayeilech', // spelling variant
};

// hebcal.com uses Sephardic-leaning transliteration in its API responses
// (e.g. "Miketz", "Toldot", "Achrei Mot") — only consulted when deriving a
// parsha from a date (see deriveParshaFromDate). Keyed by normalize()'d
// hebcal title.
const HEBCAL_ALIASES = {
  'achrei mot': 'Acharei Mos',
  'achrei mot kedoshim': 'Acharei Mos-Kedoshim',
  bechukotai: 'Bechukosai',
  'behar bechukotai': 'Behar-Bechukosai',
  behaalotcha: 'Behaaloscha',
  bereshit: 'Bereishis',
  'chayei sara': 'Chayei Sarah',
  chukat: 'Chukas',
  'chukat balak': 'Chukas-Balak',
  'ki tavo': 'Ki Savo',
  'ki teitzei': 'Ki Seitzei',
  'ki tisa': 'Ki Sisa',
  'matot masei': 'Matos-Masei',
  miketz: 'Mikeitz',
  nasso: 'Naso',
  shemot: 'Shemos',
  toldot: 'Toldos',
  vaetchanan: 'Vaeschanan',
  vayera: 'Vayeira',
  yitro: 'Yisro',
};

// Special-Shabbos qualifiers this script recognizes on a hyphenated second
// token (e.g. "Mikeitz-Chanukah") or after a bare "Shabbos " prefix (e.g.
// "Shabbos Chanuka"). Keyed by normalize()'d variant -> canonical label
// (the label is what goes in the notes field, and what SPECIAL_SHABBOS_QUALIFIERS'
// values are printed as).
const QUALIFIER_ALIASES = {
  chanukah: 'Chanukah',
  chanuka: 'Chanukah',
  shuva: 'Shuva',
  shuvah: 'Shuva',
  zachor: 'Zachor',
  zachar: 'Zachor',
  parah: 'Parah',
  para: 'Parah',
  hachodesh: 'HaChodesh',
  hachodosh: 'HaChodesh',
  hagadol: 'HaGadol',
  chazon: 'Chazon',
  nachamu: 'Nachamu',
};

const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{2})/;
const PREFIX_RE = /^(dvar\s+torah|dave\s+torah)\s+/i;
const SHABBOS_RE = /^shabbos\s+(.+)$/i;

const hebcalMonthCache = new Map();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function expandHome(p) {
  return p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function isoDate(m, d, y2) {
  const month = Number(m);
  const day = Number(d);
  const year = 2000 + Number(y2);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Resolves free-text parsha input against the table + filename ALIASES.
// Returns the canonical table name, or null if unresolved.
function resolveParsha(text) {
  const key = normalize(text);
  if (CANONICAL_BY_KEY.has(key)) return CANONICAL_BY_KEY.get(key);
  if (ALIASES[key]) return ALIASES[key];
  return null;
}

function resolveQualifier(word) {
  return QUALIFIER_ALIASES[normalize(word)] || null;
}

// Detects a special-Shabbos qualifier in a raw (already-failed-direct-match)
// parsha token. Returns { parshaPart, qualifierLabel } or null.
//   "Mikeitz-Chanukah"  -> { parshaPart: 'Mikeitz', qualifierLabel: 'Chanukah' }
//   "Vayelech-Shuva"    -> { parshaPart: 'Vayelech', qualifierLabel: 'Shuva' }
//   "Shabbos Chanuka"   -> { parshaPart: '', qualifierLabel: 'Chanukah' }
function detectQualifier(rawParsha) {
  const hyphenIdx = rawParsha.indexOf('-');
  if (hyphenIdx > -1) {
    const first = rawParsha.slice(0, hyphenIdx).trim();
    const second = rawParsha.slice(hyphenIdx + 1).trim();
    const label = resolveQualifier(second);
    if (label) return { parshaPart: first, qualifierLabel: label };
  }

  const shabbosMatch = SHABBOS_RE.exec(rawParsha);
  if (shabbosMatch) {
    const label = resolveQualifier(shabbosMatch[1]);
    if (label) return { parshaPart: '', qualifierLabel: label };
  }

  return null;
}

// Finds the Shabbos (Saturday) on/after `iso` and asks hebcal.com what
// parsha is read that week. Returns the canonical table name, or null if
// the lookup fails for any reason (network error, no data, unresolvable
// title) — callers treat null as "could not derive, fail loudly".
async function deriveParshaFromDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const daysUntilSat = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSat);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const satIso = `${y}-${String(m).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  const cacheKey = `${y}-${m}`;
  let items = hebcalMonthCache.get(cacheKey);
  if (!items) {
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${y}&month=${m}&s=on&maj=off&min=off&mod=off&nx=off&mf=off&ss=off&c=off&geo=none`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      items = data.items || [];
      hebcalMonthCache.set(cacheKey, items);
    } catch {
      return null;
    }
  }

  const match = items.find((i) => i.category === 'parashat' && i.date === satIso);
  if (!match) return null;

  const title = match.title.replace(/^Parashat\s+/i, '').replace(/^Parshat\s+/i, '');
  return resolveParsha(title) || HEBCAL_ALIASES[normalize(title)] || null;
}

async function parseFilename(filename) {
  const name = filename.replace(/\.m4a$/i, '');
  const dateMatch = DATE_RE.exec(name);
  if (!dateMatch) {
    return { ok: false, reason: 'no date found in filename' };
  }

  const iso = isoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
  if (!iso) {
    return { ok: false, reason: `invalid date "${dateMatch[0]}"` };
  }

  let rawParsha = name.slice(0, dateMatch.index);
  rawParsha = rawParsha.replace(PREFIX_RE, '');
  rawParsha = rawParsha.replace(/[\s-]+$/, '').trim(); // trailing " -", "-", spaces before the date

  if (!rawParsha) {
    return { ok: false, reason: 'no parsha text before the date' };
  }

  const direct = resolveParsha(rawParsha);
  if (direct) {
    return { ok: true, date: iso, parsha: direct, notes: '', rawParsha, viaAlias: direct !== rawParsha };
  }

  const qualifier = detectQualifier(rawParsha);
  if (qualifier) {
    const notes = `Shabbos ${qualifier.qualifierLabel}`;

    if (qualifier.parshaPart) {
      const resolved = resolveParsha(qualifier.parshaPart);
      if (resolved) {
        return { ok: true, date: iso, parsha: resolved, notes, rawParsha, viaAlias: true, viaQualifier: true };
      }
      return {
        ok: false,
        reason: `parsha "${qualifier.parshaPart}" (before "${qualifier.qualifierLabel}" qualifier) not found in lookup table`,
      };
    }

    console.log(`  deriving parsha for "${filename}" (Shabbos ${qualifier.qualifierLabel}) via hebcal.com ...`);
    const derived = await deriveParshaFromDate(iso);
    if (derived) {
      return { ok: true, date: iso, parsha: derived, notes, rawParsha, viaAlias: true, viaQualifier: true, viaDate: true };
    }
    return { ok: false, reason: `Shabbos ${qualifier.qualifierLabel} but no parsha in filename, and could not derive one for ${iso} from hebcal.com` };
  }

  return { ok: false, reason: `parsha "${rawParsha}" not found in lookup table (and no confident alias)` };
}

function csvField(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = expandHome(args.folder);
  const outPath = args.out || 'backfill.csv';

  if (!folder) {
    console.error('Usage: node backfill/parse-filenames.mjs --folder <dir> [--out backfill.csv]');
    process.exit(1);
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    console.error(`Not a directory: ${folder}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => /\.m4a$/i.test(f))
    .sort();

  const rows = [];
  const failures = [];
  const aliased = [];
  const idCounts = new Map();

  for (const filename of files) {
    const result = await parseFilename(filename);
    if (!result.ok) {
      failures.push({ filename, reason: result.reason });
      continue;
    }

    rows.push({ filename, date: result.date, parsha: result.parsha, notes: result.notes || '' });

    if (result.viaQualifier) {
      aliased.push(
        `${filename}  ->  parsha "${result.parsha}", notes "${result.notes}"${result.viaDate ? ' (parsha derived from date)' : ''}`
      );
    } else if (result.viaAlias) {
      aliased.push(`${filename}  ->  "${result.rawParsha}" normalized to "${result.parsha}"`);
    }

    const id = `${result.date}-${result.parsha.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
    idCounts.set(id, (idCounts.get(id) || []).concat(filename));
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const hasNotes = rows.some((r) => r.notes);
  const header = hasNotes ? 'filename,date,parsha,notes' : 'filename,date,parsha';
  const csv =
    [header, ...rows.map((r) => {
      const cells = [csvField(r.filename), r.date, csvField(r.parsha)];
      if (hasNotes) cells.push(csvField(r.notes));
      return cells.join(',');
    })].join('\n') + '\n';
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, csv);

  console.log(`Scanned ${files.length} .m4a files in ${folder}`);
  console.log(`Wrote ${rows.length} rows to ${outPath}`);

  if (aliased.length) {
    console.log(`\nNormalized ${aliased.length} parsha name(s) — double-check these in the CSV:`);
    for (const line of aliased) console.log(`  ${line}`);
  }

  const dupes = [...idCounts.entries()].filter(([, list]) => list.length > 1);
  if (dupes.length) {
    console.log(`\n${dupes.length} id(s) shared by more than one file (same date+parsha) — only the first will upload, the rest will be skipped as duplicates:`);
    for (const [id, list] of dupes) {
      console.log(`  ${id}:`);
      for (const f of list) console.log(`    ${f}`);
    }
  }

  if (failures.length) {
    console.log(`\n${failures.length} file(s) could not be parsed — handle these by hand:`);
    for (const f of failures) console.log(`  ${f.filename}\n    reason: ${f.reason}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll files parsed cleanly.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
