import pdfplumber, sys, json, re
from collections import Counter
def clean(s): return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()
HEADER = re.compile(r'^(S\.? ?No\.?|Sl\.? ?no\.?|Publishing Document|Scenarios?|Schedule( Name)?|Version No\.?|Category of)', re.I)
def headings(words):
    out = []
    for i, w in enumerate(words[:-1]):
        if w['text'] != 'Category': continue
        a = words[i+1]['text']; b = words[i+2]['text'] if i + 2 < len(words) else ''
        m = re.fullmatch(r'([ABCDE])(/\s*([ABCDE]))?:?', a)
        if m:
            cat = m.group(1) + ('/' + m.group(3) if m.group(3) else '')
            if a.endswith('/') : pass
            out.append((w['top'], cat)); continue
        m = re.fullmatch(r'([ABCDE])/', a)
        if m and re.fullmatch(r'([ABCDE]):?', b): out.append((w['top'], m.group(1) + '/' + b[0]))
    return out
def inside(a, b):
    return a is not b and a.bbox[0] >= b.bbox[0]-1 and a.bbox[1] >= b.bbox[1]-1 and a.bbox[2] <= b.bbox[2]+1 and a.bbox[3] <= b.bbox[3]+1
def parse(path):
    pdf = pdfplumber.open(path)
    cat = None; rules = []; maps = []; last = None; lastmap = None; started = False
    for pno, page in enumerate(pdf.pages):
        tables = page.find_tables()
        tables = [t for t in tables if not any(inside(t, o) for o in tables)]
        events = [(h[0], 'h', h[1]) for h in headings(page.extract_words())] + [(t.bbox[1], 't', t) for t in tables]
        events.sort(key=lambda e: (e[0], e[1]))
        for _, kind, obj in events:
            if kind == 'h':
                cat = obj; started = True; continue
            if not started: continue
            for row in obj.extract():
                cells = [clean(c) for c in row]
                nonempty = [c for c in cells if c]
                if not nonempty: continue
                if HEADER.match(nonempty[0]) and len(' '.join(nonempty)) < 60: continue
                if 'Action to be Taken' in ' '.join(nonempty) or 'Action to be taken' in ' '.join(nonempty): continue
                first = cells[0]
                m = re.fullmatch(r'(\d+)\.?', first) or (re.fullmatch(r'(\d+)\.?', nonempty[0]) if len(cells) <= 3 else None)
                if m:
                    rest = [c for c in cells[1:] if c] if re.fullmatch(r'(\d+)\.?', first) else nonempty[1:]
                    if not rest: continue
                    rule = {'category': cat, 'no': int(m.group(1)), 'page': pno + 1}
                    if len(rest) >= 2: rule['schedule'] = rest[0]; rule['text'] = ' '.join(rest[1:])
                    else: rule['text'] = rest[0]
                    rules.append(rule); last = rule; lastmap = None
                elif len(cells) >= 4 and len(nonempty) >= 3:
                    sched = cells[0] or (lastmap or {}).get('schedule', '')
                    vals = cells[1:]
                    rec = {'schedule': sched, 'item': vals[0], 'itrRef': vals[1] if len(vals) > 1 else '', 'form3cdRef': ' '.join(v for v in vals[2:] if v), 'page': pno + 1}
                    maps.append(rec); lastmap = rec; last = None
                else:
                    text = ' '.join(nonempty)
                    if lastmap is not None and len(cells) >= 4:
                        for k, v in zip(['item', 'itrRef', 'form3cdRef'], cells[1:4]):
                            if v: lastmap[k] = (lastmap[k] + ' ' + v).strip()
                    elif last is not None: last['text'] += ' ' + text
    recover(pdf, rules)
    for r in rules: r['text'] = clean(r['text'])
    return rules, maps
JUNK = re.compile(r'^(Page \d+|Table \d+:.*|\d+(\.\d+)* Category.*|Category [A-E].*|Sl\.? ?no\.?|S\.? ?No\.?|Publishing Document|Scenarios?)$', re.I)
def region_text(page, top, bottom):
    if bottom - top < 4: return ''
    text = page.crop((0, max(0, top), page.width, min(page.height, bottom))).extract_text() or ''
    lines = [l.strip() for l in text.split('\n') if l.strip() and not JUNK.match(l.strip())]
    return clean(' '.join(lines))
def recover(pdf, rules):
    have = {(r['category'], r['no']) for r in rules}
    for i, r in enumerate(rules):
        prev = r['no'] - 1
        if prev < 1 or (r['category'], prev) in have: continue
        if i == 0 or rules[i-1]['category'] != r['category'] or rules[i-1]['no'] != prev - 1: continue
        page = pdf.pages[r['page'] - 1]
        tables = [t for t in page.find_tables()]
        first_top = min((t.bbox[1] for t in tables), default=page.height)
        text = region_text(page, 40, first_top)
        if len(text) < 15 and r['page'] >= 2:
            pp = pdf.pages[r['page'] - 2]
            tb = [t for t in pp.find_tables()]
            text = region_text(pp, max((t.bbox[3] for t in tb), default=0), pp.height - 40)
        text = re.sub(r'(^|\s)%d\.(\s|$)' % prev, ' ', text).strip()
        if len(text) >= 15:
            rules.insert(i, {'category': r['category'], 'no': prev, 'page': r['page'], 'text': text, 'recovered': True})
            have.add((r['category'], prev))
if __name__ == '__main__':
    r, m = parse(sys.argv[1])
    json.dump({'rules': r, 'auditCrossChecks': m}, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    print(sys.argv[2], len(r), dict(Counter(x['category'] for x in r)), 'maps', len(m), 'withSched', sum(1 for x in r if 'schedule' in x))
