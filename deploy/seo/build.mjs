import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EARLY_ACCESS_ACTION, GUIDE_INDEX, ORIGIN, PAGES, PLAY_ID, US_FORMS } from './pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(here, '..', 'public');

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function playUrl(campaign, content = '') {
  const referrer = `utm_source=web&utm_medium=site&utm_campaign=${campaign}${content ? `&utm_content=${content}` : ''}`;
  return `https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=${encodeURIComponent(referrer)}`;
}

const bySlug = Object.fromEntries(PAGES.map((page) => [page.slug, page]));

function shell({ path, title, description, body, ld, edition = 'india' }) {
  const url = path ? `${ORIGIN}/${path}` : `${ORIGIN}/`;
  return `<!DOCTYPE html>
<html lang="${edition === 'us' ? 'en-US' : 'en-IN'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FAFAF7">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${ORIGIN}/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/Inter-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
${ld.map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`).join('\n')}
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <nav>
      <a class="brand" href="/" aria-label="MyCA home"><img src="/assets/logo.svg" alt="" width="26" height="26"><span>My<span class="ca">CA</span></span></a>
      <ul>
        <li class="hide-sm"><a href="/guides">Guides</a></li>
        <li class="hide-sm"><a href="/us">MyCA US</a></li>
        <li><a href="/#pricing">Pricing</a></li>
        <li><a class="btn primary small" href="/#get">Get MyCA</a></li>
      </ul>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap row">
    <div>
      <a class="brand" href="/"><img src="/assets/logo.svg" alt="" width="26" height="26"><span>My<span class="ca">CA</span></span></a>
      <p>ML Dynamic Solutions Private Limited.</p>
    </div>
    <ul>
      <li><a href="/guides">Guides</a></li>
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/delete-account">Delete your account</a></li>
      <li><a href="/status">Status</a></li>
    </ul>
  </div>
</footer>
</body>
</html>
`;
}

function ctaHref(page) {
  if (page.cta.href) return page.cta.href;
  return playUrl(page.slug.replace(/[^a-z0-9]+/g, '_'));
}

export function earlyAccess(slug) {
  const id = `early-access-${slug.replace(/[^a-z0-9]+/g, '-')}`;
  return `
  <section class="block" id="early-access">
    <div class="wrap">
      <h2>Get early access</h2>
      <p class="sub">Leave your email and we write when MyCA US opens in January 2027, with the launch price. Every email has an unsubscribe link.</p>
      <form class="early-access" id="${id}" method="post" action="${EARLY_ACCESS_ACTION}" hidden>
        <label for="${id}-email">Email</label>
        <div class="row">
          <input id="${id}-email" type="email" name="email_address" autocomplete="email" required maxlength="254" placeholder="you@example.com">
          <button class="btn primary" type="submit">Tell me when it opens</button>
        </div>
        <p class="fine">Your email goes only to our list provider and is used only for MyCA US launch news. See <a href="/privacy">Privacy</a>.</p>
      </form>
      <p class="fine" id="${id}-off">The early-access list opens soon. Check back here.</p>
      <script>
        (function () {
          var form = document.getElementById('${id}');
          if (!/^https:\\/\\/[^\\s"<>]+$/.test(form.getAttribute('action') || '')) return;
          form.hidden = false;
          document.getElementById('${id}-off').hidden = true;
        })();
      </script>
    </div>
  </section>`;
}

export function renderPage(page) {
  const path = page.slug;
  const product = page.edition === 'us' ? 'MyCA US' : 'MyCA';
  const forms = page.slug === 'us'
    ? `
  <section class="block" id="forms">
    <div class="wrap">
      <h2>Forms in the first season</h2>
      <p class="sub">If your return needs something not on this list, MyCA tells you before you pay.</p>
      <ul class="chips">${US_FORMS.map((form) => `<li>${escape(form)}</li>`).join('')}</ul>
    </div>
  </section>`
    : '';
  const early = page.edition === 'us' ? earlyAccess(page.slug) : '';
  const body = `  <div class="wrap guide-hero">
    <p class="eyebrow">${escape(page.eyebrow)}</p>
    <h1 class="display">${escape(page.h1)}</h1>
    <p class="lede">${escape(page.lede)}</p>
    <div class="cta"><a class="btn primary" href="${escape(ctaHref(page))}">${escape(page.cta.label)}</a></div>
    <p class="fine">${escape(page.cta.note)}</p>
  </div>
  <section class="block">
    <div class="wrap">
      <h2>How ${product} does it</h2>
      <div class="guide-points">
${page.points.map(([title, text]) => `        <div class="card"><h3>${escape(title)}</h3><p>${escape(text)}</p></div>`).join('\n')}
      </div>
    </div>
  </section>${forms}${early}
  <section class="block">
    <div class="wrap">
      <h2>Questions</h2>
      <div class="faq">
${page.faq.map(([q, a]) => `        <details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n')}
      </div>
      <h2 class="more">Read next</h2>
      <ul class="tile-list">
${page.related.map((slug) => `        <li><a href="/${slug}">${escape(bySlug[slug].h1)}</a></li>`).join('\n')}
      </ul>
    </div>
  </section>`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: product,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Android',
      url: `${ORIGIN}/${path}`,
      description: page.description,
      publisher: { '@type': 'Organization', name: 'ML Dynamic Solutions Private Limited' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Guides', item: `${ORIGIN}/guides` },
        { '@type': 'ListItem', position: 2, name: page.eyebrow, item: `${ORIGIN}/${path}` },
      ],
    },
  ];
  return shell({ path, title: page.title, description: page.description, body, ld, edition: page.edition });
}

export function renderGuides() {
  const group = (edition, heading) => `      <h2 class="more">${heading}</h2>
      <ul class="tile-list">
${PAGES.filter((page) => page.edition === edition).map((page) => `        <li><div><a href="/${page.slug}"><b>${escape(page.h1)}</b></a><p>${escape(page.description)}</p></div></li>`).join('\n')}
      </ul>`;
  const body = `  <div class="wrap guide-hero">
    <h1 class="display">${escape(GUIDE_INDEX.h1)}</h1>
    <p class="lede">${escape(GUIDE_INDEX.description)}</p>
  </div>
  <section class="block">
    <div class="wrap">
${group('india', 'GST and books in India')}
${group('us', 'US federal taxes')}
    </div>
  </section>`;
  return shell({ path: GUIDE_INDEX.slug, title: GUIDE_INDEX.title, description: GUIDE_INDEX.description, body, ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: GUIDE_INDEX.title, url: `${ORIGIN}/${GUIDE_INDEX.slug}` }] });
}

export function renderSitemap() {
  const paths = ['', GUIDE_INDEX.slug, ...PAGES.map((page) => page.slug), 'privacy'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${ORIGIN}/${path}</loc></url>`).join('\n')}
</urlset>
`;
}

export function renderRobots() {
  return `User-agent: *
Allow: /
Disallow: /r/

Sitemap: ${ORIGIN}/sitemap.xml
`;
}

export function renderInvite() {
  const body = `  <div class="wrap guide-hero invite">
    <p class="eyebrow">You were invited</p>
    <h1 class="display">Someone you know keeps their books in MyCA.</h1>
    <p class="lede">Get the app and enter this invite code after you sign in: open Your business, then Invite a business owner.</p>
    <p class="code" id="code" aria-live="polite">&nbsp;</p>
    <div class="cta"><a class="btn primary" id="play" href="${escape(playUrl('referral'))}">Get MyCA for Android</a><a class="btn" href="/">What is MyCA?</a></div>
    <p class="fine">Invite codes work in the first 30 days after you join.</p>
  </div>
  <script>
    (function () {
      var raw = (location.pathname.split('/')[2] || '').toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
      if (raw.length !== 8) return;
      document.getElementById('code').textContent = raw;
      var play = document.getElementById('play');
      play.href = ${JSON.stringify(`https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=`)} + encodeURIComponent('utm_source=referral&utm_medium=invite&utm_campaign=referral&utm_content=' + raw);
    })();
  </script>`;
  return shell({ path: 'invite', title: 'You were invited to MyCA', description: 'Someone you know invited you to MyCA. Get the app and enter their invite code after you sign in.', body, ld: [] }).replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"');
}

export function outputs() {
  const files = {
    'invite.html': renderInvite(),
    'guides.html': renderGuides(),
    'sitemap.xml': renderSitemap(),
    'robots.txt': renderRobots(),
  };
  for (const page of PAGES) files[`${page.slug}.html`] = renderPage(page);
  return files;
}

export function stale(dir = PUBLIC_DIR) {
  const out = [];
  for (const [name, text] of Object.entries(outputs())) {
    let current = null;
    try {
      current = readFileSync(join(dir, name), 'utf8');
    } catch {
      current = null;
    }
    if (current !== text) out.push(name);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, text] of Object.entries(outputs())) {
    const target = join(PUBLIC_DIR, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  process.stdout.write(`wrote ${Object.keys(outputs()).length} files\n`);
}
