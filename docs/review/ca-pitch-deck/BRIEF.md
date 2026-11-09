# BRIEF.md — MyCA CA product review deck

## Frontmatter

workflow: slideshow
flow: automation
storyboard: no
message: "MyCA keeps the books so the owner never has to learn accounting, and every figure traces to a posted invoice."
destination: live review with two CAs (presenter mode + speaker notes)
aspect: 16:9 (1920x1080)
language: en
audience: two practising Chartered Accountants
length: 17 main slides + 1 branch, ~60 minutes with discussion

## Intent

Show the owner flow end to end using the 26 rendered golden screens, show exactly
where a CA stays in control (preview before post, maker-checker review, append-only
ledger, no silent filing), and collect what would stop them trusting MyCA with a
client. Close on verified status, not adjectives.

## Customizations

- Slideshow, not video: discrete slides, fragment reveals, one hotspot branch
  (Home -> first-day empty state), presenter mode with CA-language speaker notes.
- Evidence over mockups: phone screenshots kept at aspect with object-fit contain.
- No invented figures: status numbers from STATUS.md, gaps from mobile/README.

## Layout

- `index.html` is the composition: 17 main scenes plus the slideshow island and a
  seekable root timeline. `screens/` holds the golden screenshots plus `w_*`
  live Windows captures (Vouchers, GST, govt, APIs). New since the phone-only
  cut: `s-flow` (capture-to-filing diagram), `s-firm` (Windows workbench),
  `s-backend` (gated integrations with four-gate fragments).
- `compositions/branch.html` is the branch slide as a sub-composition. The mount
  is what makes the player inject its runtime, which is what reports scenes to
  the slideshow controller; without it the deck stays on "Loading slides".
- `standalone.html` opens the same deck without `present`, for emailing ahead.
- `vendor/` holds the Apache-2.0 player bundles so the standalone file works offline.

## Present

- `npx hyperframes present docs/review/ca-pitch-deck`, then click Present or press
  P for the audience tab. In Google Meet share the audience tab.
- Never render this deck to MP4: render keeps only the first scene.
- `npm run check` is clean: 0 errors. Remaining warnings are Studio editability
  hints; layout, motion and contrast passes run in the browser session.
