# Backfilling old recordings

For uploading a batch of existing m4a recordings (e.g. old voice memos synced
from iCloud Drive to a Mac) through the same `/upload` endpoint the iOS
Shortcut uses — so the manifest + feed stay the single source of truth.

Two scripts, two steps: **parse filenames into a CSV you review**, then
**upload from that CSV**. Requires Node 18+ (uses global `fetch`/`FormData`/
`Blob`/`readdirSync` — no npm install needed).

## 1. Get the files onto disk

Sync the folder from iCloud Drive (Voice Memos or wherever they live) to the
Mac, e.g. `~/Past Recordings/`.

## 2. Parse filenames into a CSV

If your filenames already contain the parsha and date (e.g.
`Dvar Torah Korach 6.19.26.m4a`), don't fill in a CSV by hand — parse it out
directly:

```
node backfill/parse-filenames.mjs --folder "~/Past Recordings" --out backfill/backfill.csv
```

(Quote the `--folder` path if it has spaces in it, like the example above.)

This scans every `.m4a` in the folder, and for each one:

- Extracts the date (`M.D.YY`, anywhere in the filename) and the parsha text
  before it (stripping a leading `Dvar Torah` / `Dave Torah` label and a
  trailing ` -` separator, both common in real filenames).
- Normalizes the parsha name against the same lookup table the server uses
  (`functions/_shared/parsha-data.js`), including a small, explicit alias
  list for confident one-to-one spelling variants seen in real filenames
  (e.g. `Bshalach` → `Beshalach`, `Vaera` → `Vaeira`, `Shemini` → `Shmini`).
  These are printed at the end so you can double-check them.
- **Never guesses.** A filename with no parseable date, or a parsha string
  that doesn't match the table or the alias list (ambiguous combos like
  `Mikeitz-Chanukah` or `Shabbos Chanuka`, where more than one real parsha
  could be meant), is left out of the CSV and listed as a failure at the end
  for you to add by hand.
- Also flags (without failing) any files that would produce the *same*
  upload id — same date + same parsha — so you know which duplicates will
  get skipped automatically in step 3.

Review `backfill/backfill.csv` before moving on — it's plain
`filename,date,parsha`, one row per recording. Fix or add rows by hand as
needed; anything you add manually just needs those three columns and no
special formatting.

If your filenames *don't* encode date/parsha, skip this step and write
`backfill.csv` by hand instead (see `backfill/example.csv` for the format;
an optional 4th `notes` column is also supported by the upload script).

## 3. Upload from the CSV

```
UPLOAD_TOKEN=<your upload token> node backfill/upload.mjs \
  --folder "~/Past Recordings" \
  --csv backfill/backfill.csv
```

Or pass the token directly: `--token <your upload token>`.

Add `--dry-run` first to preview without uploading anything:

```
UPLOAD_TOKEN=... node backfill/upload.mjs --folder "~/Past Recordings" --csv backfill/backfill.csv --dry-run
```

### What it does

- Fetches the live `manifest.json` first and computes the `id` each CSV row
  would produce (`{date}-{slugified parsha}` — same logic the server uses).
- Skips any row whose id already exists in the manifest (or was already
  uploaded earlier in the same run) — **safe to re-run** after fixing a typo
  or adding more rows to the CSV; nothing gets re-uploaded or duplicated.
- Uploads everything else through `POST /upload` as `multipart/form-data`
  (`file` + `parsha` + `date` fields) — the same request shape
  `backfill/example.csv`-style manual uploads use, and functionally
  equivalent to what the iOS Shortcut sends via its header/raw-body mode.
  The server derives the Hebrew name/sefer and (if parseable) the audio
  duration, and regenerates the manifest + feed after each upload.
- Uploads **sequentially**, one file at a time, with a small delay between
  requests (750ms by default — override with `--delay-ms`).
- Prints `[n/total] OK / SKIP / FAIL` progress per row as it goes, and a
  summary count at the end. Exits non-zero if anything failed, so it's
  script-friendly.

## By default it targets production

Both scripts hit `https://weekly-dvar-torah.pages.dev` unless you set
`BASE_URL` to something else (useful for testing against
`wrangler pages dev` locally, e.g. `BASE_URL=http://localhost:8788`).
