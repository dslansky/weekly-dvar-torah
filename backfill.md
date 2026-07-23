# Backfilling old recordings

For uploading a batch of existing m4a recordings (e.g. old voice memos synced
from iCloud Drive to a Mac) through the same `/upload` endpoint the iOS
Shortcut uses — so the manifest + feed stay the single source of truth.

## 1. Get the files onto disk

Sync the folder from iCloud Drive (Voice Memos or wherever they live) to the
Mac, e.g. `~/DvarTorah/`.

## 2. Fill in the CSV

Create a CSV in that folder (see `backfill/example.csv`) with columns:

```
filename,date,parsha,notes
```

- `filename` — relative to the folder you pass to `--folder`.
- `date` — `YYYY-MM-DD`, the Friday (or relevant date) the dvar Torah is for.
- `parsha` — Ashkenazi transliteration, e.g. `Lech Lecha`, `Vayakhel-Pekudei`,
  `Acharei Mos-Kedoshim`. For Yamim Tovim, any freeform text works.
- `notes` — optional, can be left blank.

`notes` is optional as a column too — a 3-column `filename,date,parsha` CSV
works fine.

## 3. Run the script

Requires Node 18+ (uses global `fetch`/`FormData`/`Blob` — no npm install
needed).

```
UPLOAD_TOKEN=<your upload token> node backfill/upload.mjs \
  --folder ~/DvarTorah \
  --csv ~/DvarTorah/backfill.csv
```

Or pass the token directly: `--token <your upload token>`.

Add `--dry-run` first to see what would upload without actually doing it:

```
UPLOAD_TOKEN=... node backfill/upload.mjs --folder ~/DvarTorah --csv ~/DvarTorah/backfill.csv --dry-run
```

## What it does

- Fetches the live `manifest.json` first and computes the `id` each CSV row
  would produce (`{date}-{slugified parsha}` — same logic the server uses).
- Skips any row whose id already exists in the manifest — **safe to re-run**
  after fixing a typo or adding more rows to the CSV; already-uploaded rows
  won't be re-uploaded or duplicated.
- Uploads everything else through `POST /upload`, same as the Shortcut —
  the server derives the Hebrew name/sefer and (if parseable) the audio
  duration, and regenerates the manifest + feed after each upload.
- Prints `OK` / `SKIP` / `FAIL` per row and a summary count at the end. Exits
  non-zero if anything failed, so it's script-friendly.

## By default it targets production

The script hits `https://weekly-dvar-torah.pages.dev` unless you set
`BASE_URL` to something else (useful for testing against
`wrangler pages dev` locally, e.g. `BASE_URL=http://localhost:8788`).
