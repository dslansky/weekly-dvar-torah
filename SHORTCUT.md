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

   *(Optional but recommended)* Add a second **Ask for Input** (Text, allow
   blank) for `Notes`, and a third for `Date` (only needed if archiving
   something other than "this past Friday" — leave blank normally and let
   the server default to today in America/New_York).

4. **Build the upload request:**
   - Add action **Get Contents of URL**.
   - URL: `https://weekly-dvar-torah.pages.dev/upload`
   - Method: `POST`
   - Headers: add one header —
     - Key: `Authorization`
     - Value: `Bearer <your UPLOAD_TOKEN>` (the exact value you set with
       `wrangler pages secret put UPLOAD_TOKEN` — get it from whoever
       deployed this, it's not in any repo file)
   - Request Body: **Form**
     - Add field `file`, type **File**, value = the `Shortcut Input`
       (the shared audio).
     - Add field `parsha`, type **Text**, value = `ParshaName` variable.
     - (Optional) add field `notes`, type **Text**, value = your Notes
       variable.
     - (Optional) add field `date`, type **Text**, value = your Date
       variable, format `YYYY-MM-DD`.

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
