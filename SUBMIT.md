# Submitting the podcast

Feed URL (always use this one): **`https://weekly-dvar-torah.pages.dev/feed.xml`**

Before submitting anywhere:

- [ ] Upload at least one episode (an empty feed gets rejected by both directories).
- [ ] Confirm the feed validates — https://podba.se/validate/ or
      https://www.castfeedvalidator.com/, paste the feed URL above.
- [ ] Confirm `https://weekly-dvar-torah.pages.dev/artwork.jpg` loads and looks right
      at thumbnail size (shrink it in a browser tab, don't just check full size).

## Artwork requirements (both directories)

- Square JPG or PNG, **3000×3000** (Apple: min 1400×1400, max 3000×3000).
- RGB color space (not CMYK).
- Ideally under 512KB — smaller files load faster in podcast apps' grids.
- No transparency.

The current placeholder (`design/artwork-source.svg` → uploaded to R2 as
`artwork.jpg`) satisfies all of this. Replace it any time — see README.md
"Replacing the podcast artwork."

## Apple Podcasts Connect

1. Go to https://podcastsconnect.apple.com and sign in with the Apple ID you
   want to own the show (this can't easily be transferred later, so use the
   right account up front).
2. Click the **+** button → **New Show**.
3. Paste the feed URL: `https://weekly-dvar-torah.pages.dev/feed.xml`
4. Apple crawls and validates the feed. If it fails, re-run it through the
   validator above and fix, then retry — Apple's own error messages are
   often vague.
5. Once validated, review the auto-pulled metadata (title, author,
   description, category, artwork) against the feed and confirm.
6. Submit. Apple's review is usually within a few hours to 2 business days.
   You'll get an email when it's live, and the show gets an Apple Podcasts
   ID + URL you can share.
7. After approval, new episodes (i.e. every future `/upload`) go live
   automatically — Apple re-polls the feed periodically (`feed.xml` is
   served with `max-age=300`, so changes propagate fast on Apple's side too).

## Spotify for Creators

1. Go to https://podcasters.spotify.com and sign in (or create an account —
   a plain Spotify account works).
2. Choose **Add or claim your podcast** → **I have a podcast already** (or
   the equivalent "Add via RSS" flow — Spotify's onboarding wording changes
   periodically).
3. Paste the feed URL: `https://weekly-dvar-torah.pages.dev/feed.xml`
4. Spotify will ask you to verify ownership of the feed. Depending on the
   current flow this is either automatic (they trust the RSS `itunes:owner`
   / feed control) or requires a one-time verification code — follow
   whatever the UI asks for at that step.
5. Confirm show details pulled from the feed, submit.
6. Spotify review is typically same-day to a few days.

## After both are live

Update the "Subscribe as a podcast" link near the top of `index.html` to
include the Apple and Spotify show URLs alongside the feed link (the feed
link should stay regardless — it's the permanent, directory-independent way
to subscribe).
