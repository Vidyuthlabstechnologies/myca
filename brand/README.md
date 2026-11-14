# Brand kits

Source for MyCA's brand and marketing material, one folder per country app. The design tokens in
[`design/`](../design/README.md) stay the single source for colours, type and spacing; this folder
holds what is built from them for marketing.

| Path | What |
|---|---|
| `logo/` | The logo pack: mark and lockups as SVG, wordmark outlined from Inter SemiBold. Made by `tools/make-logos.py` |
| `india/BRAND-GUIDELINES.md` | MyCA India brand guidelines: logo rules, colour, type, Bahi, voice, what we may claim |
| `india/copy/` | Play captions and promo cards, social posts for launch month, launch emails, WhatsApp forwards, CA firm pitch talk track |
| `india/templates/` | HTML templates for every graphic: store screenshots, social, email headers, one-pager, CA firm deck, brand sheet, logo PNGs |
| `tools/render.mjs` | Renders every template to `<country>/out/` (PNG frames and PDFs) |

## Rendering

```bash
python3 -m pip install fonttools pillow
python3 brand/tools/make-logos.py        # only after a change to the mark or wordmark
node brand/tools/render.mjs              # everything
node brand/tools/render.mjs social       # templates whose path contains "social"
```

`render.mjs` uses the Playwright and Chromium installed on the machine (`require('playwright')`).
Each `[data-frame]` element becomes `<name>.png`, opaque unless it has `data-alpha="true"`, and at
`data-scale` times its size. A template whose `<body>` has `data-pdf` is also printed to a PDF using
its `@page` size. `out/` is not committed: the rendered set is kept in the project's shared files.

The store screenshots are framed from the raw app screens in `docs/release/assets/play/`, which are
rendered by `mobile/tool/play_listing_test.dart`. Render those first after a change to the app.
