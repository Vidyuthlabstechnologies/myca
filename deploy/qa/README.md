# Website quality checks

These checks keep the public MyCA website (`deploy/public`, served by `deploy/site`) at
release quality. GitHub Actions runs them in `.github/workflows/site-quality.yml` on every
pull request that touches `deploy/`, on pushes to `develop` and `main`, and every Monday
(the Monday run also checks external links and reports broken ones as warnings).

| Check | What fails it |
|---|---|
| `node --test deploy/seo/*.test.mjs` (no install) | A generated page out of date (run `node deploy/seo/build.mjs`), a page without its title, description, canonical, skip link or single `h1`, an inline script or style that the content security policy would block, a missing security header in the nginx config, an internal page linked or listed, an India legal page with `[blanks]` that is indexable, a Play link while the app is not listed, India prices that differ from `cloud/src/billing.mjs` |
| `node check-site.mjs [url]` | A page that does not answer 200, a missing security header, no gzip, a broken internal link or `#anchor`, a 404 that is not the MyCA page, a sitemap that lists a missing or `noindex` page or leaves out an indexable one, sideways scrolling at 360 px, a console or content security policy error, a font that fails, a serious or critical accessibility problem (axe, WCAG 2.2 AA) |
| `node lighthouse.mjs [url]` | Performance below 90, or accessibility, best practices or SEO below 95, on the home page, a guide, the guides index, MyCA US and the disclaimer |

## Run it on your computer

```bash
cd deploy/qa
npm ci
npx playwright install chromium
docker build -f ../site/Dockerfile -t myca-site:local ../..
docker run -d --rm --name myca-site -p 8080:8080 myca-site:local
node check-site.mjs http://localhost:8080
node lighthouse.mjs http://localhost:8080
```

Reports go to `deploy/qa/reports/`.

## Switches

- `PLAY_LISTED` in `deploy/seo/pages.mjs`: set it to `true` the day the Play listing for
  `com.mldynamic.myca` is public, then run `node deploy/seo/build.mjs`. Until then every
  "Get MyCA for Android" button goes to the Get MyCA section of the home page instead of a
  Play page that answers "not found".
- `research.html` and `status.html` are internal planning pages. They stay out of search
  (header and meta `noindex`), out of the sitemap and unlinked until the owner decides
  whether to delete them.

## Bahi and the animations

- Bahi on the site is an inline SVG drawn by `deploy/seo/bahi.mjs` from the same geometry as the
  app's Rive file (`bahi.riv`), with the five moods (wave, happy, thinking, celebrate, worried) in
  `assets/bahi.css` and the eyes, tips and the companion that follows you down the home page in
  `assets/bahi.js`. The Rive web runtime is not used: it needs WebAssembly, which the content
  security policy does not allow, and it would add about 400 KB.
- The home page demos (the phone chat, Say it / See it / Say yes, the invoice-to-return flow and
  the due-date calendar) are in `assets/home.js` and `assets/home.css`. Without JavaScript, with
  "reduce motion" set, or after "Pause animations", every demo shows its finished state.
- The hero Bahi and the home FAQ (with its FAQPage structured data) are written into `index.html`
  by `node deploy/seo/build.mjs`; edit the FAQ in `HOME_FAQ` in `deploy/seo/pages.mjs`.
- Sharing images: `cd deploy/qa && node og-images.mjs` draws a 1200 x 630 image for every guide
  page into `deploy/public/assets/og/`. Run it after changing a page's heading or demo.

## What only the owner can fill in

Contact details come from the company's own site, mldynamic.com (registered office, support
`info@mldynamic.com`, Grievance Officer email `privacy@mldynamic.com`, phone, courts at
Hyderabad), and live in `LEGAL_INDIA` in `cloud/src/consent.mjs` and the legal pages. Still
blank, so the India privacy policy, terms, refunds and Grievance Officer pages stay `noindex`
and out of the sitemap: the CIN, the Grievance Officer's name, and counsel's liability
wording in the terms. Once a page has no blanks, remove its `noindex` line and rebuild; the
tests then require it in the sitemap.
