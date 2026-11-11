"""Build MyCA's ITR knowledge base from the source folder.

Usage (from the repo root):
    python3 -I platform/scripts/itr-knowledge/build.py "<path to 'ITR knowledge' folder>"

Needs pdfplumber and openpyxl. Writes platform/src/itr-knowledge/forms/itr-N/*.json.
The hand-written guides in platform/src/itr-knowledge/docs are not touched.
Personal data is never copied: sample returns and Form 16s are summarised by hand,
and the utility's protection keys (HashKey, Password) are dropped.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import field_guide  # noqa: E402
import validation_rules  # noqa: E402

import openpyxl  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'itr-knowledge', 'forms'))
SECRET_LISTS = re.compile(r'hash|password|pwd|ifsc|bankcode|banknamelist|isin|pincode|pin code', re.I)
SKIP_SHEETS = re.compile(r'^(IFSC|BankCode|ISIN List|DataBase|DropDownValues|DB|Temporary Values|Sheet1|Index|112|115|ITold|OLDAL|OS_Old)$', re.I)


def clean(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip()


# ---------- JSON schema -> field dictionary ----------

def flatten_schema(schema):
    defs = schema.get('definitions', {})
    fields = []

    def resolve(node):
        seen = 0
        while isinstance(node, dict) and '$ref' in node and seen < 20:
            name = node['$ref'].split('/')[-1]
            extra = {k: v for k, v in node.items() if k != '$ref'}
            node = {**defs.get(name, {}), **extra, '_def': name}
            seen += 1
        if isinstance(node, dict) and 'allOf' in node:
            merged = {k: v for k, v in node.items() if k != 'allOf'}
            for part in node['allOf']:
                part = resolve(part)
                for k, v in part.items():
                    merged.setdefault(k, v)
            node = merged
        return node

    def walk(node, path, required, stack):
        node = resolve(node)
        kind = node.get('type')
        if isinstance(kind, list):
            kind = '/'.join(kind)
        if kind == 'object' or 'properties' in node:
            if node.get('_def') in stack:
                fields.append({'path': path, 'type': 'object', 'recursive': node.get('_def')})
                return
            stack = stack + [node.get('_def')]
            req = set(node.get('required', []))
            if path:
                fields.append({'path': path, 'type': 'object', 'required': required, 'definition': node.get('_def', ''), 'description': clean(node.get('description', ''))})
            for name, child in node.get('properties', {}).items():
                walk(child, f'{path}.{name}' if path else name, name in req, stack)
            return
        if kind == 'array':
            entry = {'path': path, 'type': 'array', 'required': required}
            for key in ('minItems', 'maxItems'):
                if key in node:
                    entry[key] = node[key]
            fields.append(entry)
            walk(node.get('items', {}), path + '[]', True, stack)
            return
        entry = {'path': path, 'type': kind or 'any', 'required': required}
        if node.get('description'):
            entry['description'] = clean(node['description'])
        for key in ('enum', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'format'):
            if key in node:
                entry[key] = node[key]
        if node.get('_def'):
            entry['definition'] = node['_def']
        fields.append(entry)

    walk(schema['properties']['ITR'], 'ITR', True, [])
    return fields


# ---------- Excel utility ----------

def dropdown_lists(ws):
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {}
    header = rows[0]
    lists = {}
    for col, name in enumerate(header):
        name = clean(name)
        if not name or SECRET_LISTS.search(name) or re.fullmatch(r'[0-9A-Za-z]{15}', name):
            continue
        values = []
        for row in rows[1:]:
            if col < len(row) and row[col] not in (None, ''):
                value = clean(row[col])
                if value and value != '(Select)' and value not in values:
                    values.append(value)
            if len(values) >= 1500:
                break
        if not values or all(re.fullmatch(r'\d{6}(\.0)?', v) for v in values[:20]):
            continue
        values = [v for v in values if not re.fullmatch(r'infyxl\w+', v, re.I)]
        if any(re.fullmatch(r'pwd|password|hash ?key|hash ?iteration', v, re.I) for v in values):
            continue  # the workbook's protection settings, not a list a return uses
        if name == '(Select)' or any(re.fullmatch(r'[0-9A-Za-z+/=]{15,}', v) for v in values[:3]):
            continue
        lists[name] = values
    return lists


def sheet_labels(ws, limit=400):
    labels = []
    for row in ws.iter_rows(values_only=True):
        for value in row:
            if isinstance(value, str):
                text = clean(value)
                if 2 < len(text) <= 240 and not re.fullmatch(r'[\d.,\-\s]+|\(Select\)|[A-Z]{1,3}\d*|infyxl\w*', text, re.I) and text not in labels:
                    labels.append(text)
        if len(labels) >= limit:
            break
    return labels


def read_utility(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets, help_rows, dropdowns = [], [], {}
    for ws in wb.worksheets:
        title = ws.title.strip()
        if re.fullmatch(r'Help|Instructions|HelpCSV', title, re.I):
            for row in ws.iter_rows(values_only=True):
                cells = [clean(v) for v in row if v not in (None, '')]
                if cells:
                    help_rows.append(' | '.join(cells))
            continue
        if re.fullmatch(r'DataBase|DropDownValues|DB', title, re.I):
            dropdowns.update(dropdown_lists(ws))
            continue
        if SKIP_SHEETS.match(title):
            continue
        sheets.append({'sheet': title, 'state': ws.sheet_state, 'labels': sheet_labels(ws)})
    return {'file': os.path.basename(path), 'sheets': sheets, 'help': help_rows, 'dropdowns': dropdowns}


# ---------- field guide merge ----------

def split_paths(cell):
    tokens = cell.split()
    joined = []
    for t in tokens:
        # a path broken by the column wrap ("Section80CCDEmp loyer", "Section1 6ia") is glued back
        prev = joined[-1] if joined else ''
        if prev and is_path(prev) and (re.match(r'^[a-z]', t) or (re.match(r'^\d', t) and prev[-1].isdigit())) and not re.search(r'[).,]$', prev):
            joined[-1] += t
        elif prev and is_path(prev) and re.fullmatch(r'[A-Z][A-Za-z0-9_]+', t) and not t.startswith('Schedule'):
            joined.append('.' + t)
        else:
            joined.append(t)
    paths = [t for t in joined if is_path(t)]
    rest = [t for t in joined if not is_path(t)]
    base = ''
    out = []
    for p in paths:
        if p.startswith('.') and base:
            out.append(base + p)
        else:
            base = p.split('.')[0]
            out.append(p)
    return out, ' '.join(rest)


def is_path(token):
    return bool(field_guide.PATH.match(token)) or (token.startswith('.') and len(token) > 2 and token[1].isalpha())


def guide_entries(pdf_path):
    records, prose = field_guide.parse(pdf_path)
    entries = []
    for r in records:
        paths, spill = split_paths(r['path'])
        entries.append({
            'section': r['section'],
            'paths': paths or [r['path']],
            'description': clean(f"{spill} {r['description']}"),
            'primarySource': r['primarySource'],
            'validationSource': r['validationSource'],
            'conflictTrigger': r['conflictTrigger'],
            'page': r['page'],
        })
    return entries, prose


def layout_fallback(pdf, rules):
    """Recover Category A rules that the table reader missed, from pdftotext's layout text."""
    have = {r['no'] for r in rules if r['category'] == 'A'}
    top = max(have) if have else 0
    missing = [n for n in range(1, top + 1) if n not in have]
    if not missing:
        return []
    try:
        text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    except Exception:
        return []
    lines = text.split('\n')
    found = []
    for n in missing:
        for i, line in enumerate(lines):
            m = re.match(r'^\s{0,8}%d\.?\s{1,}(\S.*)$' % n, line)
            if not m:
                continue
            body = [m.group(1)]
            for nxt in lines[i + 1:i + 8]:
                if re.match(r'^\s{0,8}\d+\.?\s{1,}\S', nxt) or not nxt.strip() or 'Page ' in nxt:
                    break
                body.append(nxt.strip())
            found.append({'category': 'A', 'no': n, 'page': None, 'text': clean(' '.join(body)), 'recovered': True})
            break
    return found


def rule_gaps(rules):
    gaps = {}
    for cat in sorted({r['category'] for r in rules}):
        nos = {r['no'] for r in rules if r['category'] == cat}
        missing = [n for n in range(1, max(nos) + 1) if n not in nos]
        if missing:
            gaps[cat] = missing
    return gaps


def main(root):
    sources = json.load(open(os.path.join(HERE, '..', '..', 'src', 'itr-knowledge', 'sources.json')))
    by_id = {s['id']: s for s in sources['sources']}
    for n in range(1, 7):
        form = f'itr-{n}'
        folder = os.path.join(OUT, form)
        os.makedirs(folder, exist_ok=True)
        src = {k: by_id[f'{form}-{k}'] for k in ('schema', 'rules', 'utility', 'guide') if f'{form}-{k}' in by_id}

        rules_pdf = os.path.join(root, src['rules']['path'])
        rules, cross = validation_rules.parse(rules_pdf)
        annex = [{'code': r['no'], 'text': r['text'], 'page': r['page']} for r in rules if r['no'] >= 1000 and r['category'] != 'A']
        rules = [r for r in rules if r['no'] < 1000 or r['category'] == 'A']
        rules += layout_fallback(rules_pdf, rules)
        rules.sort(key=lambda r: ('ABCDE'.index(r['category'][0]), r['category'], r['no']))
        for r in rules:
            r['id'] = f"{form.upper()}-{r['category'].replace('/', '')}-{r['no']}"
            r['text'] = re.sub(r'^CBDT_e-Filing_ITR \d_Validation Rules for AY 2025-26 V 1\.0 \d+ ', '', r['text'])
        rules_doc = {'form': form.upper(), 'source': src['rules']['id'], 'title': src['rules']['title'],
                     'categories': {'A': 'Return cannot be uploaded; the portal shows an error.',
                                    'B': 'Return is uploaded, but the taxpayer is told of a possible defect u/s 139(9) and CPC may send a notice.',
                                    'D': 'Return is uploaded, but a deduction or claim may not be allowed unless the supporting claim form or particulars are filed.',
                                    'B/D': 'Category B or D (the source lists them in one table).'},
                     'rules': rules, 'auditCrossChecks': cross}
        if annex:
            rules_doc['businessCodesListed'] = annex
        gaps = rule_gaps(rules)
        if gaps:
            rules_doc['numbersNotInSource'] = gaps
        json.dump(rules_doc, open(os.path.join(folder, 'rules.json'), 'w'), ensure_ascii=False, indent=0)

        schema_path = os.path.join(root, src['schema']['path'])
        schema = json.load(open(schema_path))
        json.dump(schema, open(os.path.join(folder, 'schema.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        fields = flatten_schema(schema)
        fields_doc = {'form': form.upper(), 'source': src['schema']['id'], 'count': len(fields), 'fields': fields}
        if 'guide' in src:
            entries, prose = guide_entries(os.path.join(root, src['guide']['path']))
            fields_doc['guide'] = {'source': src['guide']['id'], 'entries': entries}
            open(os.path.join(folder, 'guide-prose.txt'), 'w').write('\n'.join(prose))
        json.dump(fields_doc, open(os.path.join(folder, 'fields.json'), 'w'), ensure_ascii=False, indent=0)

        utility = read_utility(os.path.join(root, src['utility']['path']))
        utility['source'] = src['utility']['id']
        json.dump(utility, open(os.path.join(folder, 'utility.json'), 'w'), ensure_ascii=False, indent=0)
        print(form, 'rules', len(rules), 'cross', len(cross), 'fields', len(fields), 'guide', len(fields_doc.get('guide', {}).get('entries', [])), 'sheets', len(utility['sheets']), 'dropdowns', len(utility['dropdowns']), flush=True)


if __name__ == '__main__':
    main(sys.argv[1])
