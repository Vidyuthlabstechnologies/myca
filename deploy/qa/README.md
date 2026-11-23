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

## What only the owner can fill in

The India privacy policy, terms, refunds and Grievance Officer pages still carry
`[blanks]` (CIN, registered office, support email, Grievance Officer, the city for
disputes) and stay `noindex` and out of the sitemap until they are filled. The same values
live in `LEGAL_INDIA` in `cloud/src/consent.mjs`. The delete-account page tells people to
"write to the support email" without showing one yet. Once a page has no blanks, remove its
`noindex` line and rebuild; the tests then require it in the sitemap.
