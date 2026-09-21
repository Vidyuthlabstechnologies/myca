import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const REPO = new URL('../../', import.meta.url);

function read(rel) {
  return readFileSync(new URL(rel, REPO), 'utf8').replace(/\r\n/g, '\n');
}

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function scalar(raw) {
  let v = raw.trim();
  if (!v.startsWith('"') && !v.startsWith("'")) v = v.replace(/\s+#.*$/, '');
  if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((s) => unquote(s)).filter((s) => s !== '');
  return unquote(v);
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isSkippable(line) {
  const t = line.trim();
  return t === '' || t.startsWith('#');
}

function parseYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  const skip = () => { while (i < lines.length && isSkippable(lines[i])) i += 1; };
  const startsItem = (line) => line.trimStart().startsWith('- ') || line.trim() === '-';
  const blockScalar = (parentIndent) => {
    const out = [];
    let base = null;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') { out.push(''); i += 1; continue; }
      if (indentOf(line) <= parentIndent) break;
      if (base === null) base = indentOf(line);
      out.push(line.slice(base));
      i += 1;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return `${out.join('\n')}\n`;
  };
  const node = (indent) => {
    skip();
    if (i >= lines.length || indentOf(lines[i]) < indent) return null;
    return startsItem(lines[i]) ? sequence(indentOf(lines[i])) : mapping(indentOf(lines[i]));
  };
  const value = (rest, indent) => {
    if (/^[|>][-+]?$/.test(rest)) return blockScalar(indent);
    if (rest !== '') return scalar(rest);
    skip();
    if (i < lines.length && (indentOf(lines[i]) > indent || (indentOf(lines[i]) === indent && startsItem(lines[i])))) return node(indentOf(lines[i]));
    return '';
  };
  const mapping = (indent) => {
    const out = {};
    for (;;) {
      skip();
      if (i >= lines.length || indentOf(lines[i]) !== indent || startsItem(lines[i])) return out;
      const m = lines[i].trim().match(/^("[^"]*"|'[^']*'|[^:]+?):(?:\s+(.*))?$/);
      if (!m) throw new Error(`yaml: cannot parse line ${i + 1}: ${lines[i]}`);
      i += 1;
      out[unquote(m[1])] = value((m[2] || '').trim(), indent);
    }
  };
  const sequence = (indent) => {
    const out = [];
    for (;;) {
      skip();
      if (i >= lines.length || indentOf(lines[i]) !== indent || !startsItem(lines[i])) return out;
      const rest = lines[i].trimStart().slice(1).trimStart();
      if (/^("[^"]*"|'[^']*'|[^:\s"'][^:]*?):(\s|$)/.test(rest)) {
        lines[i] = `${' '.repeat(indent + 2)}${rest}`;
        out.push(mapping(indent + 2));
      } else {
        i += 1;
        out.push(value(rest, indent));
      }
    }
  };
  return node(0) || {};
}

function workflowFiles() {
  return readdirSync(new URL('.github/workflows/', REPO)).filter((f) => /\.ya?ml$/.test(f)).sort();
}

function workflow(name) {
  return parseYaml(read(`.github/workflows/${name}`));
}

function allSteps(wf) {
  return Object.entries(wf.jobs || {}).flatMap(([jobName, job]) => (job.steps || []).map((step) => ({ jobName, job, step })));
}

function jobEnv(wf, job) {
  return { ...(wf.env || {}), ...(job.env || {}) };
}

test('yaml helper: parses the workflow subset the release tests rely on', () => {
  const doc = parseYaml('on:\n  push:\n    tags: ["v*"]\njobs:\n  a:\n    env:\n      X: "${{ github.ref_name }}"\n    steps:\n      - uses: o/r@abc\n        with:\n          k: v\n      - name: s\n        run: |\n          echo "$X"\n\n          echo done\n');
  assert.deepEqual(doc.on.push.tags, ['v*']);
  assert.equal(doc.jobs.a.env.X, '${{ github.ref_name }}');
  assert.equal(doc.jobs.a.steps[0].uses, 'o/r@abc');
  assert.equal(doc.jobs.a.steps[0].with.k, 'v');
  assert.equal(doc.jobs.a.steps[1].run, 'echo "$X"\n\necho done\n');
});

test('CI: no workflow interpolates a ${{ }} expression inside a run script', () => {
  const offenders = [];
  for (const file of workflowFiles()) {
    for (const { jobName, step } of allSteps(workflow(file))) {
      if (typeof step.run === 'string' && step.run.includes('${{')) offenders.push(`${file}:${jobName}:${step.name || step.run.split('\n')[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('CI: the release tag reaches scripts only through env and is validated against ^v[0-9.]+$ first', () => {
  const wf = workflow('build-windows.yml');
  const tagJobs = Object.entries(wf.jobs).filter(([, job]) => (job.steps || []).some((s) => typeof s.run === 'string' && s.run.includes('$RELEASE_TAG')));
  assert.ok(tagJobs.length > 0, 'some job uses $RELEASE_TAG');
  for (const [jobName, job] of tagJobs) {
    assert.equal(jobEnv(wf, job).RELEASE_TAG, '${{ github.ref_name }}', `${jobName} takes RELEASE_TAG from env`);
    const first = job.steps.find((s) => typeof s.run === 'string' && s.run.includes('$RELEASE_TAG'));
    assert.match(first.run, /\[\[ "\$RELEASE_TAG" =~ \^v\[0-9\.\]\+\$ \]\]/, `${jobName} validates the tag in its first tag-using step`);
    assert.match(first.run, /exit 1/);
  }
});

test('CI: the build job holds no write token; only publish holds contents and id-token write', () => {
  const wf = workflow('build-windows.yml');
  assert.ok(!Object.values(wf.permissions || {}).includes('write'), 'workflow-level permissions grant no write');
  const build = wf.jobs.build;
  assert.equal(typeof build.permissions, 'object', 'build declares its own permissions');
  assert.ok(!Object.values(build.permissions).includes('write'), 'build holds no write permission');
  assert.ok(build.steps.some((s) => /\bnpm ci\b/.test(s.run || '')), 'build installs dependencies');
  const writers = Object.entries(wf.jobs).filter(([, job]) => Object.values(job.permissions || {}).includes('write')).map(([name]) => name);
  assert.deepEqual(writers, ['publish']);
  const publish = wf.jobs.publish;
  assert.equal(publish.permissions.contents, 'write');
  assert.equal(publish.permissions['id-token'], 'write');
  assert.deepEqual([].concat(publish.needs), ['build']);
  assert.match(publish.if, /github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.ok(!publish.steps.some((s) => /\bnpm\b|\bnpx\b|electron-builder/.test(s.run || '')), 'publish runs no package scripts');
});

test('CI: the release publishes SHA256SUMS, generated at build and verified before publishing', () => {
  const wf = workflow('build-windows.yml');
  const build = wf.jobs.build;
  assert.ok(build.steps.some((s) => s['working-directory'] === 'platform' && /^node scripts\/sha256sums\.mjs dist\s*$/m.test(s.run || '')), 'build writes dist/SHA256SUMS');
  const upload = build.steps.find((s) => String(s.uses || '').startsWith('actions/upload-artifact@'));
  assert.match(upload.with.path, /platform\/dist\/SHA256SUMS/);
  const publish = wf.jobs.publish;
  const verifyAt = publish.steps.findIndex((s) => /sha256sum -c SHA256SUMS/.test(s.run || ''));
  const releaseAt = publish.steps.findIndex((s) => String(s.uses || '').startsWith('softprops/action-gh-release@'));
  assert.ok(verifyAt >= 0 && verifyAt < releaseAt, 'checksums are verified before the release is created');
  assert.match(publish.steps[releaseAt].with.files, /dist\/SHA256SUMS/);
  const archive = publish.steps.find((s) => /releases\/\$\{RELEASE_TAG\}\//.test(s.run || ''));
  assert.match(archive.run, /dist\/SHA256SUMS/);
});

test('release: Windows signing follows CSC_LINK instead of being switched off in package.json', () => {
  const win = JSON.parse(read('platform/package.json')).build.win;
  assert.equal(Object.hasOwn(win, 'signExecutable'), false, 'electron-builder 26 signs by default when CSC_LINK is set');
  assert.notEqual(win.sign, false);
  assert.notEqual(win.signAndEditExecutable, false);
  const wf = workflow('build-windows.yml');
  const build = wf.jobs.build;
  const pack = build.steps.find((s) => /npm run pack/.test(s.run || ''));
  assert.equal(pack.env.CSC_LINK, '${{ secrets.CSC_LINK }}');
  assert.equal(jobEnv(wf, build).HAS_SIGNING_CERT, "${{ secrets.CSC_LINK != '' }}");
  const verify = build.steps.find((s) => /Get-AuthenticodeSignature/.test(s.run || ''));
  assert.ok(verify, 'a signed build is checked for a valid Authenticode signature');
  assert.equal(verify.if, "env.HAS_SIGNING_CERT == 'true'");
  assert.match(verify.run, /-ne 'Valid'/);
  assert.match(verify.run, /exit 1/);
});

test('release: download aliases track the highest archived version under /downloads/, then the CDN is purged, one publish at a time', () => {
  const wf = workflow('build-windows.yml');
  const publish = wf.jobs.publish;
  assert.equal(typeof publish.concurrency, 'object', 'publish declares a concurrency group');
  assert.ok(publish.concurrency.group);
  assert.equal(publish.concurrency['cancel-in-progress'], 'false');
  assert.equal(jobEnv(wf, publish).URL_MAP, '${{ vars.GCP_URL_MAP }}');
  const aliasAt = publish.steps.findIndex((s) => /myca-setup\.exe/.test(s.run || ''));
  const alias = publish.steps[aliasAt].run;
  assert.match(alias, /gcloud storage ls "gs:\/\/\$\{ARTIFACTS_BUCKET\}\/releases\/"/, 'the version is chosen from every archived release');
  assert.match(alias, /\| sort -V \| tail -n1/);
  assert.match(alias, /gcloud storage cp "gs:\/\/\$\{ARTIFACTS_BUCKET\}\/releases\/\$\{highest\}\/\*"/, 'aliases are copied from the highest archive, not from this run');
  assert.match(alias, /sha256sum -c SHA256SUMS/);
  assert.match(alias, /gs:\/\/\$\{DOWNLOADS_BUCKET\}\/downloads\/\$f/, 'objects live under downloads/ because the /downloads/* path rule keeps the prefix');
  assert.match(alias, /gs:\/\/\$\{DOWNLOADS_BUCKET\}\/downloads\/SHA256SUMS/);
  assert.match(alias, /--cache-control="public, max-age=300"/);
  assert.doesNotMatch(alias, /max-age=86400/);
  const purgeAt = publish.steps.findIndex((s) => /invalidate-cdn-cache "\$\{URL_MAP\}" --path "\/downloads\/\*"/.test(s.run || ''));
  assert.ok(purgeAt > aliasAt, 'the CDN is purged after the aliases change');
  assert.match(read('infra/main.tf'), /paths\s*=\s*\["\/downloads", "\/downloads\/\*"\]/);
});

test('CI: every action is pinned to a full commit SHA with its release noted beside it', () => {
  const offenders = [];
  let pinned = 0;
  for (const file of workflowFiles()) {
    for (const line of read(`.github/workflows/${file}`).split('\n')) {
      const m = line.match(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/);
      if (!m || m[1].startsWith('./')) continue;
      if (/^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/.test(m[1]) && /^\s+#\s+v\d+\.\d+\.\d+\s*$/.test(m[2])) pinned += 1;
      else offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(pinned >= 8, 'every workflow step that uses an action was checked');
});
