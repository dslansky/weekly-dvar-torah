# iOS Shortcut: "Archive Dvar Torah"

Recreate this in the Shortcuts app. It takes a shared voice memo, asks for
the parsha name, uploads it, and shows the resulting permalink.

**Weekly flow:** record → share memo to WhatsApp (unchanged) → share the same
memo again → run this Shortcut → done.

## Steps

1. **Create a new Shortcut**, name it `Archive Dvar Torah`.

2. **Make it accept audio from the share sheet:**
   - Tap the Shortcut's settings (ⓘ) → **Use with Share Sheet** → on.
   - Under **Share Sheet Types**, restrict to **Audio** (and/or Files) so it
     shows up when sharing a Voice Memo.
   - This gives the Shortcut a `Shortcut Input` variable holding the audio
     file.

3. **Ask for the parsha name:**
   - Add action **Ask for Input** → Input Type: **Text**.
   - Prompt: `Parsha name (e.g. Lech Lecha)`.
   - Store the result as a variable, e.g. `ParshaName`.

   *(Optional but recommended)* Add more **Ask for Input** actions here
   (Text, allow blank) for `Notes`, `Title`, and/or `Date` — only needed if
   you want to fill in the optional headers in the next step. Leave `Date`
   blank normally and let the server default to today in America/New_York.

4. **Build the upload request:**
   - Add action **Get Contents of URL**.
   - URL: `https://weekly-dvar-torah.pages.dev/upload`
   - Method: `POST`
   - Headers: add these —
     - Key: `Authorization` → Value: `Bearer <your UPLOAD_TOKEN>` (the exact
       value you set with `wrangler pages secret put UPLOAD_TOKEN` — get it
       from whoever deployed this, it's not in any repo file)
     - Key: `X-Parsha` → Value: `ParshaName` variable (**required**)
     - Key: `X-Date` → Value: your Date variable, format `YYYY-MM-DD`
       (**optional** — leave the header out or blank and the server
       defaults to today in America/New_York)
     - Key: `X-Title` → Value: your Title variable (**optional** — defaults
       to "Parshas {parsha}")
     - Key: `X-Notes` → Value: your Notes variable (**optional**)
   - Request Body: **File** — set it to the `Shortcut Input` (the shared
     audio). This sends the raw audio bytes as the request body, which is
     what this endpoint mode expects — no multipart form to assemble.

   **Header values must be plain ASCII** — type parsha names in Ashkenazi
   transliteration (`Lech Lecha`, not `לך לך`) in `X-Parsha`/`X-Title`/
   `X-Notes`. Non-ASCII characters in a header will get mangled or dropped.

5. **Parse the response and show it:**
   - Add action **Get Dictionary from Input** (Input = the result of "Get
     Contents of URL").
   - Add action **Get Dictionary Value** → Key: `url` → this pulls the
     permalink (e.g. `https://weekly-dvar-torah.pages.dev/#2026-07-17-pinchas`)
     out of the JSON response `{ ok, url, entry }`.
   - Add action **Show Notification** — Title: `Archived`, Body: the `url`
     value from the previous step.
   - Add action **Copy to Clipboard** with the same `url` value, so it's
     optionally pasteable straight into WhatsApp or wherever.

   *(Optional)* Wrap steps 4–5 in an **If** checking the response's `ok`
   field, and show a different notification (e.g. "Upload failed: " + the
   `error` field) in the Otherwise branch — useful for catching a wrong/
   expired token or a bad file type without digging into Shortcuts logs.

6. **Test it:** share a short voice memo → run the Shortcut → confirm you
   get a notification with a working `#...` permalink, and that the entry
   shows up at https://weekly-dvar-torah.pages.dev/ and in
   https://weekly-dvar-torah.pages.dev/manifest.json.

## Notes

- The server infers the Hebrew name and sefer (Bereishis/Shemos/.../Moadim)
  from whatever you type as the parsha name — use the Ashkenazi
  transliteration (e.g. `Lech Lecha`, `Vayakhel-Pekudei`, `Acharei Mos-Kedoshim`).
  Anything not recognized still uploads fine — it just won't get a Hebrew
  label and lands under "Moadim" (fine for Yamim Tovim / freeform entries).
- If you ever need to fix a mistaken upload (wrong parsha name, wrong file),
  see "Fixing a bad upload" in `README.md` — it's a `DELETE` request, not
  something this Shortcut needs to handle.
- Rotating the upload token (see `README.md`) means updating the
  `Authorization` header value in step 4 of this Shortcut.
- `/upload` also still accepts the older `multipart/form-data` mode (a
  `file` field plus `parsha`/`title`/`date`/`notes` fields) — that's what
  `backfill/upload.mjs` uses. Both modes are equivalent on the server side;
  this Shortcut uses the header + raw-body mode because it's simpler to
  build in Shortcuts than assembling a multipart form.
