#!/usr/bin/env node
// Scans a folder of old recordings and derives filename,date,parsha rows for
// backfill/upload.mjs, by parsing the date and parsha name directly out of
// each filename (real files are named e.g. "Dvar Torah Korach 6.19.26.m4a").
// Writes backfill.csv for review. Never guesses: any filename whose date or
// parsha can't be confidently determined is left out of the CSV and listed
// as a failure at the end for manual handling.
//
// Usage:
//   node backfill/parse-filenames.mjs --folder "~/Past Recordings" --out backfill/backfill.csv
//
// Requires Node 18+.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalize, PARSHIYOS } from '../functions/_shared/parsha-data.js';

const LOOKUP = new Set(PARSHIYOS.map(([en]) => normalize(en)));

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
};

const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{2})/;
const PREFIX_RE = /^(dvar\s+torah|dave\s+torah)\s+/i;

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

function parseFilename(filename) {
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

  const key = normalize(rawParsha);
  let canonical = null;
  let viaAlias = false;

  if (LOOKUP.has(key)) {
    canonical = rawParsha;
  } else if (ALIASES[key]) {
    canonical = ALIASES[key];
    viaAlias = true;
  } else {
    return { ok: false, reason: `parsha "${rawParsha}" not found in lookup table (and no confident alias)` };
  }

  return { ok: true, date: iso, parsha: canonical, rawParsha, viaAlias };
}

function csvField(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function main() {
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
    const result = parseFilename(filename);
    if (!result.ok) {
      failures.push({ filename, reason: result.reason });
      continue;
    }

    rows.push({ filename, date: result.date, parsha: result.parsha });
    if (result.viaAlias) {
      aliased.push(`${filename}  ->  "${result.rawParsha}" normalized to "${result.parsha}"`);
    }

    const id = `${result.date}-${result.parsha.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
    idCounts.set(id, (idCounts.get(id) || []).concat(filename));
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const csv = ['filename,date,parsha', ...rows.map((r) => [csvField(r.filename), r.date, csvField(r.parsha)].join(','))].join('\n') + '\n';
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

main();
