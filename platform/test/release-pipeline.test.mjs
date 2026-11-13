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
  assert.deepEqual([].concat(publish.needs), ['build', 'sbom']);
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

function hclBody(text, header) {
  const at = text.search(header);
  if (at < 0) return null;
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`hcl: unbalanced block ${header}`);
}

function resource(text, type, name) {
  const body = hclBody(text, new RegExp(String.raw`^(resource|data) "${type}" "${name}" \{`, 'm'));
  assert.ok(body !== null, `${type}.${name} is declared`);
  return body;
}

function nested(body, name) {
  return hclBody(body, new RegExp(String.raw`^\s*${name} \{`, 'm'));
}

function nestedAll(body, name) {
  const out = [];
  let rest = body;
  for (;;) {
    const at = rest.search(new RegExp(String.raw`^\s*${name} \{`, 'm'));
    if (at < 0) return out;
    const inner = hclBody(rest.slice(at), new RegExp(String.raw`${name} \{`));
    out.push(inner);
    rest = rest.slice(at + rest.slice(at).indexOf(inner) + inner.length);
  }
}

function hclList(body, name) {
  const m = body.match(new RegExp(String.raw`${name}\s*=\s*\[([^\]]*)\]`));
  assert.ok(m, `${name} list is declared`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function variableNames(text) {
  return [...text.matchAll(/^variable "([^"]+)"/gm)].map((m) => m[1]).sort();
}

const BOOT = () => read('infra/bootstrap/main.tf');
const ROOT = () => read('infra/main.tf');

test('hcl helper: finds resources and nested blocks', () => {
  const tf = 'resource "a" "b" {\n  x = "${var.y}"\n  inner {\n    k = 1\n  }\n  inner {\n    k = 2\n  }\n}\nresource "a" "c" {\n  z = ["p", "q"]\n}\n';
  assert.match(resource(tf, 'a', 'b'), /x = "\$\{var\.y\}"/);
  assert.deepEqual(nestedAll(resource(tf, 'a', 'b'), 'inner').map((s) => s.trim()), ['k = 1', 'k = 2']);
  assert.deepEqual(hclList(resource(tf, 'a', 'c'), 'z'), ['p', 'q']);
});

test('infra: the deploy WIF provider trusts only this repository id on main or a v* tag', () => {
  const boot = BOOT();
  const provider = resource(boot, 'google_iam_workload_identity_pool_provider', 'github');
  const condition = provider.match(/attribute_condition\s*=\s*(.+)/)[1];
  assert.match(condition, /assertion\.repository_id == \\"\$\{var\.github_repository_id\}\\"/);
  assert.match(condition, /assertion\.ref == \\"refs\/heads\/main\\" \|\| assertion\.ref\.startsWith\(\\"refs\/tags\/v\\"\)/);
  assert.doesNotMatch(condition, /assertion\.repository ==/, 'the repository name can be re-registered; the id cannot');
  assert.match(provider, /"attribute\.repository_id"\s*=\s*"assertion\.repository_id"/);
  const binding = resource(boot, 'google_service_account_iam_member', 'deployer_wif');
  assert.match(binding, /google_service_account\.deployer\.name/);
  assert.match(binding, /principalSet:\/\/iam\.googleapis\.com\/\$\{google_iam_workload_identity_pool\.github\.name\}\/attribute\.repository_id\/\$\{var\.github_repository_id\}/);
  const vars = read('infra/bootstrap/variables.tf');
  assert.ok(variableNames(vars).includes('github_repository_id'));
  assert.ok(!variableNames(vars).includes('github_branch_restriction'), 'the any-branch escape hatch is gone');
  assert.match(hclBody(vars, /^variable "github_repository_id" \{/m), /validation \{[\s\S]*can\(regex\("\^\[0-9\]\+\$"/);
});

test('infra: PR plans use their own pool and a read-only service account', () => {
  const boot = BOOT();
  const provider = resource(boot, 'google_iam_workload_identity_pool_provider', 'github_plan');
  assert.match(provider, /google_iam_workload_identity_pool\.github_plan\.workload_identity_pool_id/);
  const condition = provider.match(/attribute_condition\s*=\s*(.+)/)[1];
  assert.match(condition, /assertion\.repository_id == \\"\$\{var\.github_repository_id\}\\"/);
  assert.match(condition, /assertion\.event_name == \\"pull_request\\"/);
  resource(boot, 'google_service_account', 'planner');
  const binding = resource(boot, 'google_service_account_iam_member', 'planner_wif');
  assert.match(binding, /google_service_account\.planner\.name/);
  assert.match(binding, /\$\{google_iam_workload_identity_pool\.github_plan\.name\}\/attribute\.repository_id\//);
  assert.deepEqual(hclList(boot, 'planner_roles').sort(), ['roles/artifactregistry.reader', 'roles/browser', 'roles/compute.viewer', 'roles/dns.reader', 'roles/iam.securityReviewer', 'roles/monitoring.viewer', 'roles/storage.bucketViewer'], 'read-only roles only; not basic roles/viewer, whose projectViewer convenience grant reads every bucket');
  const state = resource(boot, 'google_storage_bucket_iam_member', 'planner_state');
  assert.match(state, /role\s*=\s*"roles\/storage\.objectViewer"/);
  assert.match(state, /objects\/root\//);
  const deployBinding = resource(boot, 'google_service_account_iam_member', 'deployer_wif');
  assert.doesNotMatch(deployBinding, /github_plan/);
  const outputs = read('infra/bootstrap/outputs.tf');
  assert.match(outputs, /output "plan_workload_identity_provider"/);
  assert.match(outputs, /output "plan_service_account"/);
});

test('infra: the deployer holds no escalation roles and gets storage per bucket', () => {
  const boot = BOOT();
  const base = hclList(boot, 'deployer_roles');
  assert.ok(!base.some((r) => /networkAdmin|loadBalancerAdmin|dns\.admin|monitoring\.admin|artifactregistry\.admin/.test(r)), 'without manage_site the deployer holds no project-wide admin role');
  const roles = [...base, ...hclList(boot.replace('site_deployer_roles = var.manage_site ? [', 'site_deployer_roles = ['), 'site_deployer_roles')];
  for (const banned of ['roles/iam.serviceAccountUser', 'roles/run.admin', 'roles/secretmanager.admin', 'roles/storage.admin', 'roles/owner', 'roles/editor']) {
    assert.ok(!roles.includes(banned), `deployer_roles excludes ${banned}`);
  }
  assert.ok(!roles.some((r) => r.startsWith('roles/storage.')), 'no project-wide storage role');
  const creator = resource(boot, 'google_project_iam_custom_role', 'bucket_creator');
  assert.deepEqual(hclList(creator, 'permissions'), ['storage.buckets.create']);
  const perBucket = resource(boot, 'google_project_iam_member', 'deployer_bucket_admin');
  assert.match(perBucket, /for_each\s*=\s*var\.manage_site \? local\.app_buckets : \{\}/);
  assert.match(perBucket, /role\s*=\s*"roles\/storage\.admin"/);
  assert.match(nested(perBucket, 'condition'), /resource\.name == \\"projects\/_\/buckets\/\$\{each\.value\}\\" \|\| resource\.name\.startsWith\(\\"projects\/_\/buckets\/\$\{each\.value\}\/\\"\)/);
  const apps = hclBody(boot, /app_buckets\s*=\s*\{/);
  for (const key of ['site', 'artifacts', 'downloads']) assert.match(apps, new RegExp(String.raw`${key}\s*=`));
  assert.doesNotMatch(apps, /tfstate/);
  const state = resource(boot, 'google_storage_bucket_iam_member', 'deployer_state');
  assert.match(state, /role\s*=\s*"roles\/storage\.objectAdmin"/);
  assert.match(nested(state, 'condition'), /resource\.name == \\"projects\/_\/buckets\/\$\{google_storage_bucket\.tf_state\.name\}\\" \|\| resource\.name\.startsWith\(\\"projects\/_\/buckets\/\$\{google_storage_bucket\.tf_state\.name\}\/objects\/root\/\\"\)/, 'CI can reach only the root/ state prefix');
});

test('infra: bootstrap and root keep their state under separate prefixes', () => {
  assert.match(read('infra/versions.tf'), /backend "gcs" \{\s*prefix\s*=\s*"root"\s*\}/);
  const boot = read('infra/bootstrap/versions.tf');
  assert.match(boot, /backend "local" \{\}/);
  assert.match(boot, /prefix\s*=\s*"bootstrap"/, 'the migration note names the bootstrap prefix');
  assert.doesNotMatch(boot, /-migrate-state -backend-config="bucket=[^"]*"\s*$/m, 'no note migrates bootstrap state into the root default.tfstate');
});


test('infra: the uptime check speaks TLS and validates the certificate', () => {
  const check = nested(resource(ROOT(), 'google_monitoring_uptime_check_config', 'site'), 'http_check');
  assert.match(check, /port\s*=\s*443/);
  assert.match(check, /use_ssl\s*=\s*true/);
  assert.match(check, /validate_ssl\s*=\s*true/);
});

test('infra: public buckets grant get only; noncurrent versions expire; downloads carries no no-op rule', () => {
  const root = ROOT();
  for (const name of ['site_public', 'downloads_public']) {
    const b = resource(root, 'google_storage_bucket_iam_member', name);
    assert.match(b, /role\s*=\s*"roles\/storage\.legacyObjectReader"/, `${name} is get-only`);
    assert.match(b, /member\s*=\s*"allUsers"/);
  }
  assert.doesNotMatch(root, /roles\/storage\.objectViewer/);
  for (const name of ['site', 'artifacts']) {
    const bucket = resource(root, 'google_storage_bucket', name);
    assert.match(nested(bucket, 'versioning'), /enabled\s*=\s*true/);
    assert.ok(nestedAll(bucket, 'lifecycle_rule').some((r) => /days_since_noncurrent_time\s*=\s*\d+/.test(r) && /type\s*=\s*"Delete"/.test(r)), `${name} deletes noncurrent versions after a set number of days`);
  }
  const downloads = resource(root, 'google_storage_bucket', 'downloads');
  const versioned = /versioning \{\s*enabled\s*=\s*true/.test(downloads);
  assert.ok(versioned || !/num_newer_versions|days_since_noncurrent_time/.test(downloads), 'no version rule on an unversioned bucket');
  const cdn = nested(resource(root, 'google_compute_backend_bucket', 'downloads'), 'cdn_policy');
  for (const key of ['default_ttl', 'client_ttl']) assert.ok(Number(cdn.match(new RegExp(String.raw`${key}\s*=\s*(\d+)`))[1]) <= 300, `${key} is at most 300s`);
});

test('infra: the managed certificate has a content-derived name and is replaced before it is destroyed', () => {
  const cert = resource(ROOT(), 'google_compute_managed_ssl_certificate', 'site');
  assert.match(cert, /name\s*=\s*"\$\{local\.lb_name\}-cert-\$\{substr\(sha256\(join\(",", local\.domains\)\), 0, 8\)\}"/);
  assert.match(nested(cert, 'lifecycle'), /create_before_destroy\s*=\s*true/);
  assert.match(read('infra/outputs.tf'), /output "ssl_certificate_name"/);
});

test('infra: provider lock files are committed', () => {
  const ignore = read('.gitignore').split('\n').map((l) => l.trim());
  assert.ok(!ignore.includes('.terraform.lock.hcl'), '.gitignore does not hide the lock file');
  for (const dir of ['infra', 'infra/bootstrap']) {
    const lock = read(`${dir}/.terraform.lock.hcl`);
    assert.match(lock, /provider "registry\.terraform\.io\/hashicorp\/google" \{/);
    assert.match(lock, /constraints = "~> 6\.0"/);
    assert.match(lock, /"zh:[0-9a-f]{64}"/);
  }
});

test('CI: Terraform plans PRs read-only and applies main with every input as TF_VAR_*', () => {
  const wf = workflow('terraform.yml');
  assert.ok(!Object.values(wf.permissions || {}).includes('write'), 'no workflow-level write permission');
  const { plan, apply } = wf.jobs;
  assert.ok(plan && apply, 'separate plan and apply jobs');
  assert.equal(plan.if, "github.event_name == 'pull_request' && vars.GCP_WIF_PLAN_PROVIDER != '' && vars.MYCA_MANAGE_SITE == 'true'");
  assert.match(apply.if, /vars\.MYCA_MANAGE_SITE == 'true'/, 'the site module stays off until the owner turns it on');
  assert.equal(plan.environment, undefined, 'the PR plan job has no environment');
  assert.equal(plan.permissions['id-token'], 'write');
  assert.equal(plan.permissions.contents, 'read');
  const planAuth = plan.steps.find((s) => String(s.uses || '').startsWith('google-github-actions/auth@'));
  assert.equal(planAuth.with.workload_identity_provider, '${{ vars.GCP_WIF_PLAN_PROVIDER }}');
  assert.equal(planAuth.with.service_account, '${{ vars.GCP_PLAN_SA }}');
  assert.match(apply.if, /github\.ref == 'refs\/heads\/main'/);
  assert.match(apply.if, /github\.event_name != 'pull_request'/);
  assert.equal(apply.environment, 'production');
  const applyAuth = apply.steps.find((s) => String(s.uses || '').startsWith('google-github-actions/auth@'));
  assert.equal(applyAuth.with.workload_identity_provider, '${{ vars.GCP_WIF_PROVIDER }}');
  assert.equal(applyAuth.with.service_account, '${{ vars.GCP_DEPLOY_SA }}');
  const expected = variableNames(read('infra/variables.tf'));
  for (const [name, job] of [['plan', plan], ['apply', apply]]) {
    const env = jobEnv(wf, job);
    const missing = expected.filter((v) => !(`TF_VAR_${v}` in env));
    assert.deepEqual(missing, [], `${name} passes every root variable as TF_VAR_*`);
    for (const v of expected) assert.match(env[`TF_VAR_${v}`], /^\$\{\{ vars\.GCP_[A-Z_]+ \}\}$/, `TF_VAR_${v} comes from a repo variable`);
    const init = job.steps.find((s) => /terraform init/.test(s.run || ''));
    assert.match(init.run, /-lockfile=readonly/);
  }
  const planRun = plan.steps.find((s) => /terraform plan/.test(s.run || '')).run;
  assert.match(planRun, /-lock=false/, 'a read-only identity cannot take the state lock, so a PR plan never holds it');
  const applyRun = apply.steps.find((s) => /terraform apply/.test(s.run || '')).run;
  assert.match(applyRun, /-lock-timeout=\d+m/);
});

test('infra: root variables that cannot be empty say so', () => {
  const vars = read('infra/variables.tf');
  for (const name of ['project_id', 'region']) {
    assert.match(hclBody(vars, new RegExp(String.raw`^variable "${name}" \{`, 'm')), /validation \{/, `${name} is validated`);
  }
  assert.ok(!variableNames(vars).includes('labels'), 'labels are fixed in code, not a CI input');
});

test('docs: DEPLOYMENT.md names every repo variable and secret the workflows read', () => {
  const doc = read('DEPLOYMENT.md');
  const names = new Set();
  for (const file of workflowFiles()) {
    for (const m of read(`.github/workflows/${file}`).matchAll(/\b(vars|secrets)\.([A-Z][A-Z0-9_]*)/g)) names.add(m[2]);
  }
  const missing = [...names].filter((n) => !doc.includes(`\`${n}\``)).sort();
  assert.deepEqual(missing, []);
  assert.doesNotMatch(doc, /platform 76/);
  assert.match(doc, /github_repository_id/);
  assert.match(doc, /SHA256SUMS/);
  assert.match(doc, /prefix/);
});

test('CI: no workflow grants write at the top level; jobs holding id-token run no package scripts', () => {
  for (const file of workflowFiles()) {
    const wf = workflow(file);
    assert.ok(!Object.values(wf.permissions || {}).includes('write'), `${file} grants no write at the workflow level`);
    for (const [name, job] of Object.entries(wf.jobs)) {
      if ((job.permissions || {})['id-token'] !== 'write') continue;
      if (job.uses) {
        assert.match(job.uses, /^\.\/\.github\/workflows\/[\w-]+\.yml$/, `${file}:${name} hands id-token only to a workflow in this repository, whose own jobs are checked here`);
        continue;
      }
      assert.ok(!job.steps.some((s) => /\bnpm\b|\bnpx\b|electron-builder/.test(s.run || '')), `${file}:${name} holds id-token and runs no package scripts`);
    }
  }
});

test('CI: the hosted API rolls out to staging first, and production only after staging passes or is off', () => {
  const { staging, production } = workflow('deploy-cloud.yml').jobs;
  assert.equal(staging.uses, './.github/workflows/cloud-run-rollout.yml');
  assert.equal(production.uses, './.github/workflows/cloud-run-rollout.yml');
  assert.match(staging.if, /vars\.GCP_PROJECT_ID_STAGING != ''/, 'staging stays off until its project is set');
  assert.equal(staging.with.environment, 'staging');
  assert.equal(staging.with.server_environment, 'staging');
  assert.equal(staging.with.service, 'myca-staging-api');
  assert.deepEqual(production.needs, ['test', 'staging']);
  assert.match(production.if, /needs\.test\.result == 'success'/);
  assert.match(production.if, /"success", "skipped"/, 'production still deploys while no staging stack exists');
  assert.equal(production.with.server_environment, 'production');
  assert.equal(production.with.service, 'myca-api');

  const rollout = workflow('cloud-run-rollout.yml').jobs.rollout;
  assert.equal(rollout.environment, '${{ inputs.environment }}');
  const health = rollout.steps.find((s) => /\/v1\/health/.test(s.run || '')).run;
  assert.match(health, /\.environment == \$env/, 'the rollout proves it reached the stack it meant to');
});

function pipesOutsideQuotes(script) {
  let quote = '';
  for (let i = 0; i < script.length; i += 1) {
    const ch = script[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '\\') { i += 1; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(script[i - 1]))) {
      while (i < script.length && script[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '|' && script[i - 1] !== '|' && script[i + 1] !== '|') return true;
  }
  return false;
}

test('CI: a step that pipes a command runs with pipefail, so the command failing fails the step', () => {
  const unsafe = [];
  for (const file of workflowFiles()) {
    const wf = workflow(file);
    for (const { jobName, job, step } of allSteps(wf)) {
      if (typeof step.run !== 'string' || !pipesOutsideQuotes(step.run)) continue;
      if (/windows/i.test(String(job['runs-on'] || ''))) continue;
      const shell = step.shell || job.defaults?.run?.shell || wf.defaults?.run?.shell || '';
      if (/^(pwsh|powershell|cmd)/.test(shell)) continue;
      if (shell === 'bash' || /set -[a-z]*o pipefail|set -o pipefail/.test(step.run)) continue;
      unsafe.push(`${file}:${jobName}:${step.name || step.run.split('\n')[0]}`);
    }
  }
  assert.deepEqual(unsafe, [], 'add shell: bash (bash -eo pipefail) to these steps; the default bash -e reports the exit code of the last command in a pipe');
});

test('CI: the pipe detector ignores quoted bars, || fallbacks and comments', () => {
  assert.equal(pipesOutsideQuotes('node scripts/rules-watch.mjs | tee "$GITHUB_STEP_SUMMARY"'), true);
  assert.equal(pipesOutsideQuotes('grep -E "^(package|sdkVersion)" file'), false);
  assert.equal(pipesOutsideQuotes("sed -n 's/a|b/c/p' file"), false);
  assert.equal(pipesOutsideQuotes('test -n "$X" || exit 1'), false);
  assert.equal(pipesOutsideQuotes('echo ok # a | b'), false);
  assert.equal(pipesOutsideQuotes('printf "%s" "$v" |\n  sha256sum'), true);
});

function dockerfiles() {
  return ['cloud/Dockerfile', 'deploy/site/Dockerfile'];
}

test('#207: no workflow runs on pull_request_target', () => {
  for (const file of workflowFiles()) {
    assert.ok(!Object.keys(workflow(file).on || {}).includes('pull_request_target'), file);
  }
});

test('#207: every npm install in CI and in the images skips package install scripts', () => {
  const offenders = [];
  for (const file of workflowFiles()) {
    for (const line of read(`.github/workflows/${file}`).split('\n')) {
      if (/\bnpm (ci|install|i)\b/.test(line) && !/--ignore-scripts\b/.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  for (const file of dockerfiles()) {
    for (const line of read(file).split('\n')) {
      if (/\bnpm (ci|install|i)\b/.test(line) && !/--ignore-scripts\b/.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('#207: container base images are pinned by digest and Dependabot keeps them current', () => {
  for (const file of dockerfiles()) {
    const froms = read(file).split('\n').filter((line) => /^FROM\s/i.test(line));
    assert.ok(froms.length > 0, `${file} has a base image`);
    for (const line of froms) assert.match(line, /^FROM \S+:\S+@sha256:[0-9a-f]{64}(\s+AS\s+\w+)?$/i, `${file}: ${line}`);
  }
  const deps = parseYaml(read('.github/dependabot.yml'));
  const docker = deps.updates.find((u) => u['package-ecosystem'] === 'docker');
  assert.ok(docker, 'Dependabot watches Docker base images');
  assert.deepEqual([...docker.directories].sort(), ['/cloud', '/deploy/site']);
});

test('#207: Dependabot covers every package that has a lockfile', () => {
  const deps = parseYaml(read('.github/dependabot.yml'));
  const npmDirs = deps.updates.filter((u) => u['package-ecosystem'] === 'npm').map((u) => u.directory).sort();
  const lockDirs = readdirSync(REPO, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .filter((d) => { try { readFileSync(new URL(`${d.name}/package-lock.json`, REPO)); return true; } catch { return false; } })
    .map((d) => `/${d.name}`)
    .sort();
  assert.deepEqual(npmDirs, lockDirs);
  assert.ok(deps.updates.some((u) => u['package-ecosystem'] === 'pub' && u.directory === '/mobile'));
  assert.ok(deps.updates.some((u) => u['package-ecosystem'] === 'github-actions'));
});

test('#207: hosted images roll out by digest, with a bill of materials and build provenance for the API', () => {
  const rollout = workflow('cloud-run-rollout.yml').jobs.rollout;
  assert.equal(rollout.permissions.attestations, 'write');
  const build = rollout.steps.find((s) => /docker push "\$IMAGE"/.test(s.run || ''));
  assert.match(build.run, /RepoDigests/);
  assert.match(build.run, /IMAGE_PINNED=/);
  assert.ok(rollout.steps.some((s) => /^anchore\/sbom-action@/.test(s.uses || '') && s.with.format === 'cyclonedx-json'));
  const attest = rollout.steps.find((s) => /^actions\/attest-build-provenance@/.test(s.uses || ''));
  assert.equal(attest.with['subject-digest'], '${{ env.IMAGE_DIGEST }}');
  const deploy = rollout.steps.find((s) => /gcloud run deploy/.test(s.run || ''));
  assert.match(deploy.run, /--image "\$IMAGE_PINNED"/);
  for (const [name, job] of Object.entries(workflow('deploy-cloud.yml').jobs)) {
    if (job.uses) assert.equal(job.permissions.attestations, 'write', `${name} lets the rollout attest`);
  }
  const site = workflow('deploy-site.yml').jobs.deploy;
  assert.ok(site.steps.some((s) => /IMAGE_PINNED=/.test(s.run || '')));
  assert.ok(site.steps.some((s) => /gcloud run deploy myca-site .*--image "\$IMAGE_PINNED"/.test(s.run || '')));
});

test('#207: Windows and Android releases carry a bill of materials and build provenance', () => {
  for (const [file, sbomFile] of [['build-windows.yml', 'myca-windows.sbom.cdx.json'], ['build-android.yml', 'myca-android.sbom.cdx.json']]) {
    const wf = workflow(file);
    const sbom = wf.jobs.sbom;
    assert.ok(sbom, `${file} has an sbom job`);
    assert.deepEqual(sbom.permissions, { contents: 'read' }, `${file}: the sbom job holds no write token`);
    const step = sbom.steps.find((s) => /^anchore\/sbom-action@/.test(s.uses || ''));
    assert.equal(step.with.format, 'cyclonedx-json');
    assert.equal(step.with['output-file'], sbomFile);
    const publish = wf.jobs.publish;
    assert.ok([].concat(publish.needs).includes('sbom'));
    assert.equal(publish.permissions.attestations, 'write');
    assert.equal(publish.permissions['id-token'], 'write');
    assert.ok(publish.steps.some((s) => /^actions\/attest-build-provenance@/.test(s.uses || '') && s.with['subject-path']), `${file} attests what it publishes`);
    assert.ok(read(`.github/workflows/${file}`).includes(`dist/${sbomFile}`), `${file} attaches the bill of materials to the release`);
  }
});

test('#207: both Play listings upload with the short-lived CI token, never a stored key', () => {
  const text = read('.github/workflows/build-android.yml');
  assert.doesNotMatch(text, /PLAY_SERVICE_ACCOUNT_JSON/);
  const play = workflow('build-android.yml').jobs.play;
  assert.equal(play.environment, 'production');
  const uploads = play.steps.filter((s) => /play-upload\.mjs/.test(s.run || ''));
  assert.equal(uploads.length, 2);
  for (const s of uploads) assert.equal(s.env.PLAY_ACCESS_TOKEN, '${{ steps.play-auth.outputs.access_token }}');
});

test('#207: CodeQL scans the JavaScript and the workflows, and only CodeQL can write security events', () => {
  const wf = workflow('codeql.yml');
  assert.deepEqual(wf.permissions, { contents: 'read' });
  const job = wf.jobs.analyze;
  assert.equal(job.permissions['security-events'], 'write');
  assert.deepEqual([...job.strategy.matrix.language].sort(), ['actions', 'javascript-typescript']);
  assert.ok(Object.keys(wf.on).includes('pull_request'));
  for (const file of workflowFiles().filter((f) => f !== 'codeql.yml')) {
    for (const [name, job] of Object.entries(workflow(file).jobs)) {
      assert.notEqual((job.permissions || {})['security-events'], 'write', `${file}:${name}`);
    }
  }
});

