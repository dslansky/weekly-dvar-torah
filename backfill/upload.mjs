#!/usr/bin/env node
// Bulk-uploads a folder of old m4a recordings through the same /upload
// endpoint the iOS Shortcut uses, driven by a CSV of filename,date,parsha
// (optional 4th column: notes). Idempotent: entries whose id already exists
// in the manifest are skipped.
//
// Usage:
//   UPLOAD_TOKEN=... node backfill/upload.mjs --folder ~/DvarTorah --csv ~/DvarTorah/backfill.csv
//
// Requires Node 18+ (uses global fetch/FormData/Blob).

import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../functions/_shared/util.js';

const BASE_URL = process.env.BASE_URL || 'https://weekly-dvar-torah.pages.dev';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length && !l.startsWith('#'));

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    rows.push(row);
  }
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = args.token || process.env.UPLOAD_TOKEN;
  const folder = args.folder;
  const csvPath = args.csv;
  const delayMs = args['delay-ms'] !== undefined ? Number(args['delay-ms']) : 750;

  if (!token) {
    console.error('Missing upload token. Pass --token or set UPLOAD_TOKEN.');
    process.exit(1);
  }
  if (!folder || !csvPath) {
    console.error(
      'Usage: node backfill/upload.mjs --folder <dir> --csv <file> [--token <token>] [--delay-ms 750] [--dry-run]'
    );
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) {
    console.log('No rows in CSV, nothing to do.');
    return;
  }

  console.log(`Fetching existing manifest from ${BASE_URL}/manifest.json ...`);
  const manifestRes = await fetch(`${BASE_URL}/manifest.json`);
  const manifest = manifestRes.ok ? await manifestRes.json() : { entries: [] };
  const existingIds = new Set((manifest.entries || []).map((e) => e.id));

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;

  for (const row of rows) {
    index++;
    const progress = `[${index}/${rows.length}]`;
    const { filename, date, parsha, notes } = row;
    if (!filename || !date || !parsha) {
      console.warn(`${progress} SKIP  malformed row: ${JSON.stringify(row)}`);
      failed++;
      continue;
    }

    const id = `${date}-${slugify(parsha)}`;
    if (existingIds.has(id)) {
      console.log(`${progress} SKIP  ${id} (already in manifest)`);
      skipped++;
      continue;
    }

    const filePath = path.join(folder, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`${progress} FAIL  ${id} — file not found: ${filePath}`);
      failed++;
      continue;
    }

    if (args['dry-run']) {
      console.log(`${progress} DRY-RUN would upload ${id} from ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const form = new FormData();
    form.set('file', new Blob([buffer], { type: 'audio/mp4' }), filename);
    form.set('parsha', parsha);
    form.set('date', date);
    if (notes) form.set('notes', notes);

    try {
      const res = await fetch(`${BASE_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        console.log(`${progress} OK    ${id} -> ${body.url}`);
        existingIds.add(id);
        uploaded++;
      } else {
        console.error(`${progress} FAIL  ${id} — ${JSON.stringify(body)}`);
        failed++;
      }
    } catch (err) {
      console.error(`${progress} FAIL  ${id} — ${err.message}`);
      failed++;
    }

    if (delayMs > 0 && index < rows.length) await sleep(delayMs);
  }

  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main();
