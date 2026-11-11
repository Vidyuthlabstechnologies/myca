"""Read a Taxvela field-guide PDF (JSON path / description / primary source / validation source / conflict).

Uses pdftotext's layout mode: the columns are found from character positions that are blank on every
line of a page's table body, between the header labels.
"""
import json
import re
import subprocess
import sys

PATH = re.compile(r'^(?:[A-Za-z][A-Za-z0-9_\-]*(\.[A-Za-z0-9_\-\[\]]+)+|Schedule[A-Z0-9][A-Za-z0-9_]*(?:\[\])?|Part[_-]?B[_-]?T?TI)(?=\s|$)')
SECTION = re.compile(r'^(\d{1,2})\s+[A-Z][^.]*$')
NOISE = re.compile(r'^\s*(Taxvela Technologies Private Limited|Page \d+( of \d+)?|\d+)\s*$')
HEADER_WORDS = ('JSON Field Path', 'Description', 'Primary', 'Secondary', 'Conflict')


def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def pages_text(path):
    out = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
    return out.split('\f')


def header_positions(lines):
    for i, line in enumerate(lines):
        if 'JSON Field Path' in line:
            pos = [line.index('JSON')]
            block = '\n'.join(lines[max(0, i - 3):i + 4])
            for word in HEADER_WORDS[1:]:
                found = None
                for l in lines[max(0, i - 3):i + 4]:
                    if word in l:
                        found = l.index(word)
                        break
                if found is None:
                    return None
                pos.append(found)
            end = i
            for j in range(i, min(i + 6, len(lines))):
                if 'Trigger' in lines[j] or 'Constraints' in lines[j]:
                    end = j
            return pos, end
    return None


def boundaries(body, pos):
    """Each column is left-aligned, so its edge is the most common start of a text segment
    (text after two or more spaces) between the previous header and this one."""
    from collections import Counter
    starts = Counter()
    for line in body:
        for m in re.finditer(r'(?:(?<=\s\s)|^)\S', line):
            starts[m.start()] += 1
    cuts = []
    for i, (left, right) in enumerate(zip(pos, pos[1:])):
        lo = (cuts[-1] if cuts else left) + 4
        cands = {c: n for c, n in starts.items() if lo < c <= right + 3}
        if cands:
            top = max(cands.values())
            # among near-equal counts prefer the leftmost start: the column's own left edge
            cut = min(c for c, n in cands.items() if n >= top * 0.6)
        else:
            cut = right
        cuts.append(cut)
    return cuts


def split(line, cuts):
    edges = [0] + cuts + [10 ** 6]
    return [clean(line[a:b]) for a, b in zip(edges, edges[1:])]


def parse(path):
    records, prose = [], []
    cur = None
    section = ''
    for pno, page in enumerate(pages_text(path)):
        lines = page.split('\n')
        found = header_positions(lines)
        if not found:
            for line in lines:
                if line.strip() and not NOISE.match(line):
                    prose.append(line.strip())
            continue
        pos, end = found
        for line in lines[:max(0, end - 6)]:
            if line.strip() and not NOISE.match(line) and 'JSON Field Path' not in line:
                prose.append(line.strip())
        body = [l for l in lines[end + 1:] if not NOISE.match(l)]
        stop = len(body)
        for k, l in enumerate(body):
            if re.match(r'^\s{0,2}\d+\.\d*\s+[A-Z]', l) and not PATH.match(l.strip()):
                stop = k
                break
        table, after = body[:stop], body[stop:]
        cuts = boundaries(table, pos)
        for line in table:
            if not line.strip():
                continue
            cells = split(line, cuts)
            first = cells[0]
            whole = clean(line)
            if re.match(r'^§?\d{1,2}\s+\S', first) and not PATH.match(first):
                section = first
                cur = None
                continue
            if first and SECTION.match(first) and not any(cells[1:]):
                section = first
                cur = None
                continue
            if first and PATH.match(first) and not (cur and re.search(r'[,(/]$', cur['path'])):
                cur = {'section': section, 'path': first, 'description': cells[1], 'primarySource': cells[2], 'validationSource': cells[3], 'conflictTrigger': cells[4], 'page': pno + 1}
                records.append(cur)
            elif cur is not None:
                for key, value in zip(['path', 'description', 'primarySource', 'validationSource', 'conflictTrigger'], cells):
                    if value:
                        cur[key] = (cur[key] + ' ' + value).strip()
        for line in after:
            if line.strip():
                prose.append(line.strip())
    return records, prose


if __name__ == '__main__':
    r, prose = parse(sys.argv[1])
    json.dump({'fields': r, 'prose': prose}, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    print(len(r), 'fields; sections', len({x['section'] for x in r}))
