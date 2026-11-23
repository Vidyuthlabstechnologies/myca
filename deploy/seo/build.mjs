import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_NOTICE_MY, PRIVACY_NOTICE_MY_MS, PRIVACY_NOTICE_US } from '../../cloud/src/consent.mjs';
import { EARLY_ACCESS_ACTION, GUIDE_INDEX, ORIGIN, PAGES, PLAY_ID, PLAY_LISTED, US_FORMS, US_PRICES } from './pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(here, '..', 'public');

export const US_LEGAL_BLANK = /\[[^\]]*(company|email|partner|address|release|name)[^\]]*\]/i;

export function usLegalReady() {
  const pages = ['us/terms.html', 'us/refunds.html'].map((name) => {
    try {
      return readFileSync(join(PUBLIC_DIR, name), 'utf8');
    } catch {
      return '[company]';
    }
  });
  return ![...pages, [PRIVACY_NOTICE_US.controller, ...PRIVACY_NOTICE_US.sections.map((s) => s.body)].join('\n')].some((text) => US_LEGAL_BLANK.test(text));
}

export const LEGAL_PAGES_INDIA = Object.freeze(['privacy', 'terms', 'refunds', 'disclaimer', 'grievance', 'delete-account']);

export function indexable(name, dir = PUBLIC_DIR) {
  try {
    return !/<meta name="robots" content="[^"]*noindex/.test(readFileSync(join(dir, `${name}.html`), 'utf8'));
  } catch {
    return false;
  }
}

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function playUrl(campaign, content = '') {
  const referrer = `utm_source=web&utm_medium=site&utm_campaign=${campaign}${content ? `&utm_content=${content}` : ''}`;
  return `https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=${encodeURIComponent(referrer)}`;
}

const bySlug = Object.fromEntries(PAGES.map((page) => [page.slug, page]));

function shell({ path, title, description, body, ld, edition = 'india', noindex = false }) {
  const url = path ? `${ORIGIN}/${path}` : `${ORIGIN}/`;
  return `<!DOCTYPE html>
<html lang="${edition === 'us' ? 'en-US' : 'en-IN'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FAFAF7">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${edition === 'us' ? 'MyCA US' : 'MyCA'}">
<meta property="og:locale" content="${edition === 'us' ? 'en_US' : 'en_IN'}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${ORIGIN}/assets/${edition === 'us' ? 'og-image-us.png' : 'og-image.png'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/Inter-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
${ld.map((item) => `<script type="application/ld+json">${jsonLd(item)}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <nav>
      <a class="brand" href="${edition === 'us' ? '/us' : '/'}" aria-label="${edition === 'us' ? 'MyCA US home' : 'MyCA home'}"><img src="/assets/logo.svg" alt="" width="26" height="26"><span>My<span class="ca">CA</span></span></a>
      <ul>
${edition === 'us' ? `        <li class="hide-sm"><a href="/guides">Guides</a></li>
        <li class="hide-sm"><a href="/us#forms">Forms</a></li>
        <li><a href="/us#pricing">Pricing</a></li>
        <li><a class="btn primary small" href="/us#early-access">Get early access</a></li>` : `        <li class="hide-sm"><a href="/guides">Guides</a></li>
        <li class="hide-sm"><a href="/us">MyCA US</a></li>
        <li><a href="/#pricing">Pricing</a></li>
        <li><a class="btn primary small" href="/#get">Get MyCA</a></li>`}
      </ul>
    </nav>
  </div>
</header>
<main id="content">
${body}
</main>
<footer class="site-footer">
  <div class="wrap row">
    <div>
      <a class="brand" href="${edition === 'us' ? '/us' : '/'}"><img src="/assets/logo.svg" alt="" width="26" height="26"><span>My<span class="ca">CA</span></span></a>
      <p>ML Dynamic Solutions Private Limited.${edition === 'us' ? '' : '<br><small class="legal-line">MyCA is software by ML Dynamic Solutions Private Limited. It is not a firm of chartered accountants and does not give tax or legal advice. GST filing goes through a licensed GST Suvidha Provider; MyCA is not affiliated with GSTN, the Income Tax Department or NIC.</small>'}</p>
    </div>
    <ul>
      <li><a href="/guides">Guides</a></li>
${edition === 'us' ? (usLegalReady() ? '      <li><a href="/us/privacy">Privacy</a></li>\n' : '') : '      <li><a href="/privacy">Privacy</a></li>\n'}      <li><a href="${edition === 'us' ? '/us/delete-account' : '/delete-account'}">Delete your account</a></li>
${edition === 'us' ? (usLegalReady() ? `      <li><a href="/us/terms">Terms</a></li>
      <li><a href="/us/refunds">Refunds</a></li>
` : '') : `      <li><a href="/terms">Terms</a></li>
      <li><a href="/refunds">Refunds</a></li>
      <li><a href="/disclaimer">Disclaimer</a></li>
      <li><a href="/grievance">Grievance Officer</a></li>
`}    </ul>
  </div>
</footer>
</body>
</html>
`;
}

function ctaHref(page) {
  if (page.cta.href) return page.cta.href;
  if (!PLAY_LISTED) return '/#get';
  return playUrl(page.slug.replace(/[^a-z0-9]+/g, '_'));
}

export function earlyAccess(slug) {
  const id = `early-access-${slug.replace(/[^a-z0-9]+/g, '-')}`;
  return `
  <section class="block" id="early-access">
    <div class="wrap">
      <h2>Get early access</h2>
      <p class="sub">Leave your email and we write when MyCA US opens in January 2027, with the launch price. Every email has an unsubscribe link.</p>
      <form class="early-access" id="${id}" method="post" action="${EARLY_ACCESS_ACTION}" data-off="${id}-off" hidden>
        <label for="${id}-email">Email</label>
        <div class="row">
          <input id="${id}-email" type="email" name="email_address" autocomplete="email" required maxlength="254" placeholder="you@example.com">
          <button class="btn primary" type="submit">Tell me when it opens</button>
        </div>
        <p class="fine">Your email goes only to our list provider and is used only for MyCA US launch news. See <a href="/privacy">Privacy</a>.</p>
      </form>
      <p class="fine" id="${id}-off">The early-access list opens soon. Check back here.</p>
      <script src="/assets/early-access.js" defer></script>
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
  const pricing = page.slug === 'us'
    ? `
  <section class="block" id="pricing">
    <div class="wrap">
      <h2>Pricing</h2>
      <p class="sub">Preparing your return and seeing your refund are free. You pay only when you file.</p>
      <div class="guide-points">
        <div class="card"><h3>Federal return</h3><p class="price money">${escape(US_PRICES.returnList)}</p><p>${escape(US_PRICES.returnLaunch)} for returns filed through ${escape(US_PRICES.launchUntil)}. One payment per return and year.</p></div>
        <div class="card"><h3>MyCA Plus</h3><p class="price money">${escape(US_PRICES.plus)} a year</p><p>Quarterly estimated payments, a withholding check and help with IRS letters. Renews each year until you cancel.</p></div>
        <div class="card"><h3>Expert Review</h3><p class="price money">${escape(US_PRICES.expert)}</p><p>Opening soon: a tax professional reviews your return before you file. Join the waitlist in the app.</p></div>
      </div>
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
  </section>${forms}${pricing}${early}
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
  const legal = LEGAL_PAGES_INDIA.filter((name) => indexable(name));
  const paths = ['', GUIDE_INDEX.slug, ...PAGES.map((page) => page.slug), ...legal];
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
    <div class="cta"><a class="btn primary" id="play" href="${escape(PLAY_LISTED ? playUrl('referral') : '/#get')}"${PLAY_LISTED ? ' data-play="listed"' : ''}>Get MyCA for Android</a><a class="btn" href="/">What is MyCA?</a></div>
    <p class="fine">Invite codes work in the first 30 days after you join.</p>
  </div>
  <script src="/assets/invite.js" defer></script>`;
  return shell({ path: 'invite', title: 'You were invited to MyCA', description: 'Someone you know invited you to MyCA. Get the app and enter their invite code after you sign in.', body, ld: [], noindex: true });
}

export function renderUsPrivacy(notice = PRIVACY_NOTICE_US) {
  const body = `
  <section class="block">
    <div class="wrap prose">
      <h1>${escape(notice.title)}</h1>
${notice.status ? `      <p class="note">${escape(notice.status)}</p>\n` : ''}      <p class="fine">Version ${escape(notice.version)}. The same notice is shown in the MyCA US app before you sign in.</p>
${notice.sections.map((section) => `      <h2>${escape(section.heading)}</h2>\n${String(section.body).split(/\n\s*\n/).map((para) => `      <p>${escape(para.trim())}</p>`).join('\n')}`).join('\n')}
    </div>
  </section>`;
  return shell({ path: 'us/privacy', title: 'MyCA US privacy notice', description: 'How MyCA US collects, uses, shares and protects your tax information, including your Social Security number, and the choices and rights you have.', body, ld: [], edition: 'us' }).replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"');
}

export function renderNotFound() {
  const body = `  <div class="wrap guide-hero">
    <p class="eyebrow">Page not found</p>
    <h1 class="display">This page is not in our books.</h1>
    <p class="lede">The address may be mistyped, or the page has moved. These are the places most people are looking for.</p>
    <div class="cta"><a class="btn primary" href="/">Go to the home page</a><a class="btn" href="/guides">Read the guides</a></div>
    <ul class="tile-list not-found">
      <li><a href="/#pricing">MyCA pricing in India</a></li>
      <li><a href="/us">MyCA US</a></li>
      <li><a href="/privacy">Privacy policy</a></li>
      <li><a href="/delete-account">Delete your account</a></li>
    </ul>
  </div>`;
  return shell({ path: '404', title: 'Page not found | MyCA', description: 'This page is not on the MyCA website. Go to the home page, the guides, pricing, or the privacy and account pages.', body, ld: [], noindex: true }).replace(/<link rel="canonical"[^>]*>\n/, '').replace(/<meta property="og:url"[^>]*>\n/, '');
}

function noticeBlock(notice, lang) {
  return `      <div lang="${lang}">
      <h2>${escape(notice.title)}</h2>
${notice.status ? `      <p class="note">${escape(notice.status)}</p>\n` : ''}${notice.sections.map((section) => `      <h3>${escape(section.heading)}</h3>\n${String(section.body).split(/\n\s*\n/).map((para) => `      <p>${escape(para.trim())}</p>`).join('\n')}`).join('\n')}
      </div>`;
}

// PDPA section 7(3): the notice is in the national language and in English. One page holds both,
// built from the same text the MyCA Malaysia app shows, so the two can never drift.
export function renderMyPrivacy(english = PRIVACY_NOTICE_MY, malay = PRIVACY_NOTICE_MY_MS) {
  const body = `
  <section class="block">
    <div class="wrap prose">
      <h1>MyCA Malaysia privacy notice / Notis privasi MyCA Malaysia</h1>
      <p class="fine">Version ${escape(english.version)}. The same notice is shown in the MyCA Malaysia app before you sign in. <a href="#bm" lang="ms">Baca dalam Bahasa Melayu</a>.</p>
${noticeBlock(english, 'en')}
      <hr id="bm">
${noticeBlock(malay, 'ms')}
    </div>
  </section>`;
  return shell({ path: 'my/privacy', title: 'MyCA Malaysia privacy notice', description: 'How MyCA Malaysia collects, uses, shares and protects personal data under the Personal Data Protection Act 2010, in English and Bahasa Melayu.', body, ld: [] }).replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"');
}

export function outputs() {
  const files = {
    '404.html': renderNotFound(),
    'invite.html': renderInvite(),
    'guides.html': renderGuides(),
    'sitemap.xml': renderSitemap(),
    'robots.txt': renderRobots(),
    'us/privacy.html': renderUsPrivacy(),
    'my/privacy.html': renderMyPrivacy(),
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
