import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'brand' / 'logo'
FONT = ROOT / 'design' / 'flutter' / 'myca_design' / 'assets' / 'fonts' / 'Inter-SemiBold.ttf'

GREEN = '#1B5E3F'
GREEN_DARK_THEME = '#7FC3A0'
INK = '#15181B'
WHITE = '#FFFFFF'
CANVAS = '#FAFAF7'


def mark(tile, page, tick, rules_opacity='.6', x=0, y=0, scale=1.0):
    return (
        f'<g transform="translate({x} {y}) scale({scale})">'
        f'<rect width="96" height="96" rx="22" fill="{tile}"/>'
        f'<path d="M48 28c-8-6-18-7-28-5v44c10-2 20-1 28 5" fill="none" stroke="{page}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>'
        f'<path d="M48 28c8-6 18-7 28-5v44c-10-2-20-1-28 5z" fill="{page}" stroke="{page}" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M48 28v44" stroke="{page}" stroke-width="5" stroke-linecap="round"/>'
        f'<path d="M55 49l7 7 12-15" fill="none" stroke="{tick}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="M27 37h13M27 46h13M27 55h9" stroke="{page}" stroke-width="3" stroke-linecap="round" opacity="{rules_opacity}"/>'
        '</g>'
    )


class Wordmark:
    def __init__(self):
        self.font = TTFont(str(FONT))
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font['head'].unitsPerEm
        self.hmtx = self.font['hmtx']
        self.cap = self.font['OS/2'].sCapHeight

    def runs(self, parts, size, x, baseline, tracking=-0.02):
        s = size / self.upm
        out = []
        cursor = x
        for text, colour in parts:
            pieces = []
            for ch in text:
                name = self.cmap[ord(ch)]
                pen = SVGPathPen(self.glyphs)
                self.glyphs[name].draw(pen)
                d = pen.getCommands()
                if d:
                    pieces.append(f'<path transform="translate({cursor:.2f} {baseline:.2f}) scale({s:.5f} {-s:.5f})" d="{d}"/>')
                cursor += self.hmtx[name][0] * s + tracking * size
            out.append(f'<g fill="{colour}">{"".join(pieces)}</g>')
        return ''.join(out), cursor - tracking * size

    def cap_height(self, size):
        return self.cap * size / self.upm


def svg(w, h, body, label='MyCA', bg=None):
    back = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="{label}">{back}{body}</svg>\n'


def lockup(wm, tile, page, tick, my, ca, bg=None):
    size = 62
    gap = 26
    cap = wm.cap_height(size)
    baseline = 48 + cap / 2
    text, end = wm.runs([('My', my), ('CA', ca)], size, 96 + gap, baseline)
    return svg(end + 2, 96, mark(tile, page, tick) + text, bg=bg)


def stacked(wm, tile, page, tick, my, ca):
    size = 52
    _, width = wm.runs([('My', my), ('CA', ca)], size, 0, 0)
    w = max(width, 96)
    text, _ = wm.runs([('My', my), ('CA', ca)], size, (w - width) / 2, 96 + 22 + wm.cap_height(size))
    return svg(w, 96 + 22 + wm.cap_height(size) + size * 0.26, mark(tile, page, tick, x=(w - 96) / 2) + text)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wm = Wordmark()
    files = {
        'myca-mark.svg': svg(96, 96, mark(GREEN, WHITE, GREEN)),
        'myca-mark-reversed.svg': svg(96, 96, mark(WHITE, GREEN, WHITE)),
        'myca-mark-ink.svg': svg(96, 96, mark(INK, WHITE, INK)),
        'myca-mark-white.svg': svg(96, 96, mark(WHITE, INK, WHITE)),
        'myca-lockup.svg': lockup(wm, GREEN, WHITE, GREEN, INK, GREEN),
        'myca-lockup-on-dark.svg': lockup(wm, GREEN, WHITE, GREEN, WHITE, GREEN_DARK_THEME),
        'myca-lockup-on-green.svg': lockup(wm, WHITE, GREEN, WHITE, WHITE, WHITE),
        'myca-lockup-ink.svg': lockup(wm, INK, WHITE, INK, INK, INK),
        'myca-lockup-white.svg': lockup(wm, WHITE, INK, WHITE, WHITE, WHITE),
        'myca-stacked.svg': stacked(wm, GREEN, WHITE, GREEN, INK, GREEN),
    }
    for name, body in files.items():
        (OUT / name).write_text(body)
        print(name)


if __name__ == '__main__':
    sys.exit(main())
