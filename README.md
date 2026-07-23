# Quick Torah Thoughts — Dvar Torah Archive

A personal archive + podcast feed for weekly Dvar Torah recordings. Built on
Cloudflare: R2 for storage, Pages Functions for the API, Cloudflare Pages for
the static archive site. Everything lives on `https://weekly-dvar-torah.pages.dev`.

See also: [`SHORTCUT.md`](SHORTCUT.md) (iOS Shortcut setup), [`SUBMIT.md`](SUBMIT.md)
(podcast directory submission), [`backfill.md`](backfill.md) (bulk-upload old recordings).

## How it fits together

- **R2 bucket `dvar-torah`** (private) — stores `audio/*.m4a`, `manifest.json`,
  `feed.xml`, `artwork.jpg`. Nothing in the bucket is public; every read goes
  through a Pages Function.
- **Pages Functions** (`/functions`) — `POST /upload` and `DELETE /entry/{id}`
  (authenticated, mutate R2 + regenerate the feed), plus `GET /audio/*`,
  `GET /manifest.json`, `GET /feed.xml`, `GET /artwork.jpg` (serve from R2).
- **Static site** (`index.html`, `styles.css`, `app.js`) — fetches
  `/manifest.json` client-side and renders the archive. No build step, no
  framework.

## Repo layout

```
functions/
  upload.js              POST /upload
  entry/[id].js           DELETE /entry/{id}
  manifest.json.js        GET /manifest.json
  feed.xml.js              GET /feed.xml
  artwork.jpg.js           GET /artwork.jpg
  audio/[[path]].js        GET /audio/*
  _shared/
    parsha-data.js         parsha → Hebrew name + sefer lookup table
    manifest.js             R2 read/write helpers for manifest.json
    feed.js                  RSS/iTunes feed XML builder
    mp4-duration.js          in-Worker m4a duration parser (no deps)
    util.js                   auth check, slugify, misc helpers
index.html / styles.css / app.js    the archive site
design/artwork-source.svg           source for artwork.jpg (see below)
backfill/                            bulk-upload script + CSV template
wrangler.toml                        R2 binding config for Pages
```

## First-time setup (already done for this deploy, kept here for reference)

1. **R2 bucket** — `npx wrangler r2 bucket create dvar-torah`
2. **R2 binding** — declared in `wrangler.toml`:
   ```toml
   [[r2_buckets]]
   binding = "BUCKET"
   bucket_name = "dvar-torah"
   ```
   Pages picks this up automatically for both CLI and git-integration deploys.
3. **Upload token secret**:
   ```
   npx wrangler pages secret put UPLOAD_TOKEN --project-name=weekly-dvar-torah
   ```
   Paste a long random value (e.g. `openssl rand -hex 24`). This is the
   Bearer token the iOS Shortcut and backfill script authenticate with.
4. **Seed R2** with an empty manifest/feed and the podcast artwork so the
   site and feed don't 404 before the first upload:
   ```
   echo '{"updated":null,"entries":[]}' > manifest-seed.json
   npx wrangler r2 object put dvar-torah/manifest.json --file=manifest-seed.json \
     --content-type=application/json --cache-control="public, max-age=300" --remote
   npx wrangler r2 object put dvar-torah/artwork.jpg --file=design/artwork.jpg \
     --content-type=image/jpeg --cache-control="public, max-age=31536000, immutable" --remote
   ```
   (`feed.xml` is regenerated automatically on the first `/upload`, but it's
   fine to seed an empty one too — see git history / SUBMIT.md.)

## Rotating the upload token

```
npx wrangler pages secret put UPLOAD_TOKEN --project-name=weekly-dvar-torah
```

**This does not take effect on the currently-live deployment** — Pages binds
secrets at deploy time, not per-request, so the old token keeps working until
a new deployment goes out. Immediately after setting the secret, redeploy:

```
npx wrangler pages deploy . --project-name=weekly-dvar-torah --branch=main --commit-dirty=true
```

(or push any commit — the git integration deploy picks up the new secret
too). Verify with a quick unauthenticated-style check before updating the
Shortcut/backfill script:

```
curl -X POST https://weekly-dvar-torah.pages.dev/upload -H "Authorization: Bearer <new-token>"
# expect: {"ok":false,"error":"expected multipart/form-data"}  (means auth passed)
# NOT:    {"ok":false,"error":"unauthorized"}                  (means old deployment still live)
```

Then update the Bearer token stored in the iOS Shortcut (and the backfill
script's env var) — uploads using the old token will start getting `401`.

## Replacing the podcast artwork

The bucket's `artwork.jpg` is what serves `GET /artwork.jpg` and the
`itunes:image` in the feed — it is **not** a file in this repo's deployed
static output (deliberately: a static `/artwork.jpg` at the repo root would
shadow the Function and never update). To replace it:

```
npx wrangler r2 object put dvar-torah/artwork.jpg --file=/path/to/new-artwork.jpg \
  --content-type=image/jpeg --cache-control="public, max-age=31536000, immutable" --remote
```

Requirements: 3000×3000 JPG, ideally under 512KB (see `SUBMIT.md`). The
current placeholder's source is `design/artwork-source.svg`; regenerate with:

```
rsvg-convert -w 3000 -h 3000 -b '#FAFAF7' design/artwork-source.svg -o artwork.png
magick artwork.png -flatten -quality 82 artwork.jpg
```

## Local development

```
npx wrangler pages dev . --compatibility-date=2026-07-01
```

Create a `.dev.vars` file (gitignored) with `UPLOAD_TOKEN=<any-test-value>`
for local auth. Local R2 is emulated by wrangler/miniflare and does not touch
the real bucket.

## Deploying

Deploys happen automatically via Cloudflare Pages' git integration — push to
`main` and Cloudflare builds + deploys (no build command, output directory is
the repo root). No CI needed.

## Manifest schema

See `functions/_shared/manifest.js` / `functions/upload.js`. Each entry:

```json
{
  "id": "2026-07-17-pinchas",
  "date": "2026-07-17",
  "parsha": "Pinchas",
  "parshaHebrew": "פינחס",
  "sefer": "Bamidbar",
  "title": "Parshas Pinchas",
  "notes": "",
  "audio": "https://weekly-dvar-torah.pages.dev/audio/2026-07-17-pinchas.m4a",
  "bytes": 8421000,
  "durationSec": 412
}
```

`parshaHebrew` and `sefer` are derived automatically from `parsha` via the
lookup table in `functions/_shared/parsha-data.js`. Unrecognized names (e.g.
freeform Yom Tov entries) fall back to `sefer: "Moadim"` and no Hebrew name.

## Fixing a bad upload

```
curl -X DELETE https://weekly-dvar-torah.pages.dev/entry/2026-07-17-pinchas \
  -H "Authorization: Bearer $UPLOAD_TOKEN"
```

Removes the manifest entry, the audio file, and regenerates the feed.
