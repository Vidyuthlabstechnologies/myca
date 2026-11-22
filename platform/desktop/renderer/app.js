const apiToken = (window.myca && window.myca.apiToken) || document.querySelector('meta[name="myca-api-token"]')?.content || '';
const apiHeaders = { 'content-type': 'application/json', 'x-myca-client': apiToken };

const api = {
  async chat(message) {
    const r = await fetch('/api/chat', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ message }) });
    return r.json();
  },
  async tool(name, args) {
    const r = await fetch('/api/tool', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ name, args }) });
    return r.json();
  },
  async signIn(userId, pin) {
    const r = await fetch('/api/session/login', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ userId, pin }) });
    return r.json();
  },
  async signOut() {
    const r = await fetch('/api/session/logout', { method: 'POST', headers: apiHeaders });
    return r.json();
  },
  async asUser(userId, pin, run) {
    const signed = await this.signIn(userId, pin);
    if (!signed.ok) return signed;
    try {
      return await run();
    } finally {
      await this.signOut();
    }
  },
  async snapshot() {
    const r = await fetch('/api/snapshot', { headers: { 'x-myca-client': apiToken } });
    return r.json();
  },
  async attach(kind, name, content) {
    const r = await fetch('/api/attach', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ kind, name, content }) });
    return r.json();
  },
  async backup() {
    const r = await fetch('/api/backup', { method: 'POST', headers: apiHeaders });
    return r.json();
  },
  async restore(payload) {
    const r = await fetch('/api/restore', { method: 'POST', headers: apiHeaders, body: JSON.stringify(payload) });
    return r.json();
  },
};

const inr = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n) || 0);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function td(className, text) {
  return el('td', className, text);
}

function metric(label, value) {
  const box = el('div', 'metric');
  box.append(el('span', '', label), el('strong', '', value));
  return box;
}

function addBubble(role, text, tag) {
  const el = document.createElement('div');
  el.className = `bubble ${role}`;
  if (tag) el.append(document.createElement('div'));
  if (tag) {
    el.firstElementChild.className = 'tag';
    el.firstElementChild.textContent = tag;
  }
  el.append(document.createTextNode(text));
  document.getElementById('log').append(el);
  el.scrollIntoView({ block: 'end' });
}

function sendChat(message) {
  const q = document.getElementById('q');
  q.value = message;
  document.getElementById('composer').requestSubmit();
}

function addPreviewCard(preview) {
  const card = document.createElement('div');
  card.className = 'bubble bot preview-card';
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = `preview · ${preview.tool}`;
  card.append(tag);
  card.append(document.createTextNode(preview.summary || ''));
  for (const effect of preview.effects || []) {
    const line = document.createElement('div');
    line.className = 'preview-effect';
    line.textContent = `· ${effect}`;
    card.append(line);
  }
  const actions = document.createElement('div');
  actions.className = 'preview-actions';
  const post = document.createElement('button');
  post.type = 'button';
  post.className = 'primary';
  post.textContent = 'Post it';
  post.addEventListener('click', () => {
    actions.remove();
    sendChat(`confirm ${preview.token}`);
  });
  const drop = document.createElement('button');
  drop.type = 'button';
  drop.textContent = 'Discard';
  drop.addEventListener('click', () => {
    actions.remove();
    sendChat('no');
  });
  actions.append(post, drop);
  card.append(actions);
  document.getElementById('log').append(card);
  card.scrollIntoView({ block: 'end' });
}

function resultLine(name, result) {
  if (!result) return 'No reply from books.';
  if (result.ok === false || (result.error && !result.invoice)) return result.error ? `${result.error}${result.hint ? `: ${result.hint}` : ''}` : JSON.stringify(result);
  const inv = result.invoice;
  if (inv) return `${inv.id} · ${inv.partyName} · ₹${inr(inv.total)} (${inv.kind || name})`;
  if (name === 'approval_decide' && (result.approval || result.data?.approval)) {
    const a = result.approval || result.data.approval;
    return `${a.approvalId} ${a.status} by ${a.decidedBy} (${a.decidedRole}) for ${a.operationId}.`;
  }
  if (name === 'integration_connect') {
    const d = result.data || result;
    return `${d.connection?.requirementId || 'Requirement'} connected via ${d.connection?.provider || 'provider'} · ${d.readiness?.available || 0}/${d.readiness?.total || 0}`;
  }
  if (name === 'integration_disconnect') {
    const d = result.data || result;
    return `${d.requirementId || 'Requirement'} removed · ${d.readiness?.available || 0}/${d.readiness?.total || 0}`;
  }
  if (name === 'set_company') {
    const c = (result.data || {}).company || {};
    return `Business profile updated: ${c.name} · ${c.gstin || 'no GSTIN'} · FY ${c.fy || '—'}`;
  }
  if (name === 'add_client') {
    const c = (result.data || {}).client || {};
    return `Client ${c.clientId} added${c.gstin ? ` · ${c.gstin}` : ''}.`;
  }
  if (name === 'set_active_client') {
    return `Active book is now ${(result.data || {}).activeClientId}.`;
  }
  if (name === 'approval_request') {
    const a = (result.data || {}).approval || {};
    return `Approval ${a.approvalId} opened for ${a.operationId}.`;
  }
  if (name === 'share_invoice') {
    return `Queued ${(result.data || {}).message?.id || 'message'} for ${(result.data || {}).message?.channel || 'delivery'}.`;
  }
  if (name === 'send_notification') {
    return `Notification ${(result.data || {}).message?.id || ''} ${(result.data || {}).message?.status || 'processed'}.`;
  }
  return JSON.stringify(result.data || result).slice(0, 800);
}

function statusClass(inv) {
  if (inv.status === 'paid') return 'status';
  if (inv.status === 'partial') return 'status partial';
  if (inv.kind === 'purchase') return 'status purchase';
  return 'status posted';
}

let currentPrint = null;

function openPrint(html, name) {
  if (!html) return;
  currentPrint = { html, name: String(name || 'MyCA-document') };
  document.getElementById('printFrame').srcdoc = html;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'print'));
  document.querySelectorAll('.panel').forEach((p) => {
    const on = p.id === 'panel-print';
    p.classList.toggle('on', on);
    p.hidden = !on;
  });
}

function priorityLabel(priority) {
  return String(priority || '').replace(/_/g, ' ');
}

function renderApiReadiness(readiness, providerCatalog) {
  const metrics = document.getElementById('apiMetrics');
  const rows = document.getElementById('apiRows');
  const summary = document.getElementById('apiProviderSummary');
  if (!metrics || !rows) return;
  const providerRows = providerCatalog?.sandbox?.requirements || [];
  const providerByReq = new Map(providerRows.map((row) => [row.requirementId, row]));
  if (summary) {
    const sandbox = providerCatalog?.sandbox;
    summary.textContent = sandbox
      ? `${sandbox.name} covers ${providerRows.map((row) => row.requirementId).join(', ')} as provider adapters. Existing MyCA engines remain the source of truth.`
      : 'Provider catalog not loaded.';
  }
  const mustMissing = readiness?.mustHaveMissing?.length || 0;
  metrics.replaceChildren(
    metric('Connected', `${readiness?.available || 0} / ${readiness?.total || 0}`),
    metric('Must-have missing', mustMissing),
    metric('Next', mustMissing ? 'Core APIs' : 'GST APIs'),
  );
  rows.replaceChildren();
  for (const row of readiness?.rows || []) {
    const connection = row.connection || {};
    const provider = providerByReq.get(row.requirementId);
    const tr = document.createElement('tr');
    const connected = row.status === 'available';
    const reqCell = document.createElement('td');
    reqCell.append(el('span', 'kind', row.requirementId));
    const apiCell = document.createElement('td');
    apiCell.append(
      el('div', 'api-title', row.title),
      el('div', 'api-purpose', row.purpose),
      el('div', 'api-meta', (row.endpoints || []).join(' · ')),
      el('div', 'api-meta', (row.requiredFields || []).join(', ')),
    );
    if (connection.provider) {
      apiCell.append(el('div', 'api-provider', `${connection.provider}${connection.baseUrl ? ` · ${connection.baseUrl}` : ''}`));
    }
    if (provider) {
      const owners = (provider.existingOwners || []).slice(0, 2).join(' · ');
      apiCell.append(
        el('div', 'api-provider', `Sandbox adapter: ${provider.capability}`),
        el('div', 'api-meta', `Owners: ${owners}`),
      );
    }
    const statusCell = document.createElement('td');
    statusCell.append(el('span', connected ? 'status' : 'status partial', connected ? 'connected' : 'missing'));
    const actions = el('td', 'api-actions');
    const connectBtn = el('button', 'btn ghost api-connect', connected ? 'Update' : 'Connect');
    connectBtn.type = 'button';
    connectBtn.dataset.id = row.requirementId;
    actions.append(connectBtn);
    if (connected) {
      const removeBtn = el('button', 'btn ghost api-remove', 'Remove');
      removeBtn.type = 'button';
      removeBtn.dataset.id = row.requirementId;
      actions.append(removeBtn);
    }
    tr.replaceChildren(
      reqCell,
      apiCell,
      td('', priorityLabel(row.priority)),
      td('', priorityLabel(row.direction)),
      statusCell,
      actions,
    );
    rows.append(tr);
  }
}

function renderFirm(snap) {
  const firm = snap.company || {};
  document.getElementById('fName').value = firm.name || '';
  document.getElementById('fGstin').value = firm.gstin || '';
  document.getElementById('fPan').value = firm.pan || '';
  document.getElementById('fState').value = firm.state || '';
  document.getElementById('fFy').value = firm.fy || '';
  document.getElementById('fAddress').value = firm.address || '';
  document.getElementById('fCity').value = firm.city || '';
  document.getElementById('fPin').value = firm.pin || '';
  document.getElementById('fEntity').value = firm.entityType || 'proprietor';
  document.getElementById('firmMeta').textContent = snap.dataPath
    ? `Data: ${snap.dataPath} · provider calls: ${({ live: 'LIVE (real portals)', test: 'TEST (sandbox hosts only)' })[snap.providerEnvironment] || 'off'}${snap.mockMode ? ' · simulated' : ''}`
    : '';
}

function renderClients(snap) {
  document.getElementById('clientsActive').textContent = `Active book: ${snap.activeClientId || 'SELF'}`;
  document.getElementById('clientMetrics').replaceChildren(
    metric('Registered', (snap.clients || []).length),
    metric('Active', snap.activeClientId || 'SELF'),
  );
  const body = document.getElementById('clientRows');
  body.replaceChildren();
  for (const client of snap.clients || []) {
    const active = client.clientId === snap.activeClientId;
    const tr = document.createElement('tr');
    const action = document.createElement('td');
    const btn = el('button', 'btn ghost', active ? 'Active' : 'Switch');
    btn.type = 'button';
    btn.disabled = active;
    btn.addEventListener('click', async () => {
      await api.tool('set_active_client', { clientId: client.clientId });
      await refresh();
    });
    action.append(btn);
    tr.append(td('kind', client.clientId), td('', client.name), td('', client.gstin || '—'), td('', client.state || '—'), action);
    body.append(tr);
  }
}

function renderApprovals(snap) {
  const body = document.getElementById('approvalRows');
  body.replaceChildren();
  for (const approval of snap.approvals || []) {
    const tr = document.createElement('tr');
    const action = document.createElement('td');
    if (approval.status === 'pending') {
      const approve = el('button', 'btn ghost', 'Approve');
      const reject = el('button', 'btn ghost', 'Reject');
      approve.type = 'button';
      reject.type = 'button';
      approve.addEventListener('click', () => decideApproval(approval.approvalId, 'approve'));
      reject.addEventListener('click', () => decideApproval(approval.approvalId, 'reject'));
      action.append(approve, reject);
    }
    tr.append(td('kind', approval.approvalId), td('', approval.operationId), td('', approval.requestedBy || '—'), td('', approval.status), action);
    body.append(tr);
  }
}

async function renderUsers() {
  const target = document.getElementById('userList');
  if (!target) return;
  try {
    const r = await fetch('/api/ca/users', { headers: { 'x-myca-client': apiToken } });
    const out = await r.json();
    const users = out.data?.users || [];
    target.textContent = users.length ? users.map((u) => `${u.userId} (${u.role})`).join(' · ') : 'No users yet.';
  } catch {
    target.textContent = 'Could not read the users.';
  }
}

document.getElementById('userForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = (id) => document.getElementById(id).value.trim();
  const out = await api.asUser(value('uAdmin'), document.getElementById('uAdminPin').value, async () => {
    const r = await fetch('/api/ca/users', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ userId: value('uId'), name: value('uName'), role: value('uRole'), pin: document.getElementById('uPin').value }) });
    return r.json();
  });
  for (const id of ['uPin', 'uAdminPin']) document.getElementById(id).value = '';
  addBubble('bot', out.ok ? `Added ${out.data.userId} as ${out.data.role}.` : `User not added: ${out.error}${out.hint ? `. ${out.hint}` : ''}`, 'add_user');
  if (out.ok) for (const id of ['uId', 'uName']) document.getElementById(id).value = '';
  await renderUsers();
});

document.getElementById('pinForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const field = (id) => document.getElementById(id);
  const r = await fetch('/api/session/pin', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ userId: field('pId').value.trim(), oldPin: field('pOld').value, newPin: field('pNew').value }) });
  const out = await r.json();
  for (const id of ['pOld', 'pNew']) field(id).value = '';
  addBubble('bot', out.ok ? `PIN changed for ${out.userId}.` : `PIN not changed: ${out.error}${out.hint ? `. ${out.hint}` : ''}`, 'change_pin');
});

async function decideApproval(approvalId, decision) {
  const idField = document.getElementById('rId');
  const pinField = document.getElementById('rPin');
  const userId = idField.value.trim();
  const pin = pinField.value;
  if (!userId || !pin) {
    addBubble('bot', 'Enter the reviewer user id and PIN above the list, then press Approve or Reject again.', 'approval_decide');
    idField.focus();
    return;
  }
  const out = await api.asUser(userId, pin, () => api.tool('approval_decide', { approvalId, decision }));
  pinField.value = '';
  addBubble('bot', resultLine('approval_decide', out), 'approval_decide');
  await refresh();
}

function renderDocuments(snap) {
  document.getElementById('docsActive').textContent = `Documents for ${snap.activeClientId || 'SELF'}`;
  const body = document.getElementById('docRows');
  body.replaceChildren();
  const docs = snap.documents || [];
  if (!docs.length) {
    const tr = document.createElement('tr');
    const empty = td('empty', 'No documents filed for this client yet.');
    empty.colSpan = 6;
    tr.append(empty);
    body.append(tr);
    return;
  }
  for (const doc of docs) {
    const action = document.createElement('td');
    const btn = el('button', 'btn ghost', 'Download');
    btn.type = 'button';
    btn.addEventListener('click', () => downloadDocument(doc));
    action.append(btn);
    const tr = document.createElement('tr');
    tr.append(
      td('kind', doc.documentId),
      td('', doc.kind),
      td('', doc.fileName),
      td('num', String(doc.bytes)),
      td('', (doc.uploadedAt || '').slice(0, 10)),
      action,
    );
    body.append(tr);
  }
}

async function downloadDocument(doc) {
  const out = await api.tool('get_document', { documentId: doc.documentId });
  if (!out.ok) {
    addBubble('bot', `Could not read ${doc.documentId}: ${out.error}`, 'error');
    return;
  }
  const blob = new Blob([out.data.content], { type: out.data.contentType || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = out.data.fileName || `${doc.documentId}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  addBubble('bot', `Downloaded ${a.download}.`, 'get_document');
}

function renderOutbox(snap) {
  const body = document.getElementById('outboxRows');
  body.replaceChildren();
  const messages = snap.outbox || [];
  if (!messages.length) {
    const tr = document.createElement('tr');
    const empty = td('empty', 'Nothing queued. Open a voucher and use Share.');
    empty.colSpan = 6;
    tr.append(empty);
    body.append(tr);
    return;
  }
  for (const message of messages) {
    const action = document.createElement('td');
    if (message.status !== 'sent') {
      const send = el('button', 'btn ghost', 'Send');
      send.type = 'button';
      send.addEventListener('click', async () => {
        const out = await api.tool('send_notification', { messageId: message.id });
        addBubble('bot', out.ok ? `Sent ${message.id}.` : `Send failed: ${out.error}${out.hint ? ` ${out.hint}` : ''}`, 'send_notification');
        await refresh();
      });
      action.append(send);
    }
    const tr = document.createElement('tr');
    tr.append(
      td('kind', message.id),
      td('', message.channel),
      td('', message.to || '—'),
      td('', message.invoiceId || '—'),
      td('', message.status),
      action,
    );
    body.append(tr);
  }
}

async function shareCurrent(channel) {
  if (!currentPrint) {
    addBubble('bot', 'Open a voucher first — click a row in Vouchers.', 'error');
    return;
  }
  const to = window.prompt(channel === 'email' ? 'Email address' : 'WhatsApp number (country code, digits only)', '');
  if (to == null) return;
  const out = await api.tool('share_invoice', { invoiceId: currentPrint.name, channel, to });
  if (!out.ok) {
    addBubble('bot', `Share failed: ${out.error}`, 'error');
    return;
  }
  addBubble('bot', `Queued ${out.data.message.id}. Opening your ${channel === 'email' ? 'mail app' : 'WhatsApp'}…`, 'share_invoice');
  const link = out.data.link;
  if (window.myca && typeof window.myca.openExternal === 'function' && link) {
    await window.myca.openExternal(link);
  } else if (link) {
    window.location.href = link;
  }
  await refresh();
}

function renderDoctor(report) {
  const body = document.getElementById('doctorRows');
  if (!report) return;
  body.replaceChildren();
  for (const provider of report.providers || []) {
    const reach = provider.reachability?.status === 'ok'
      ? `ok ${provider.reachability.ms || ''}`.trim()
      : (provider.reachability?.status || '—');
    const tr = document.createElement('tr');
    tr.append(
      td('kind', provider.name),
      td('', (provider.requirements || []).join(', ')),
      td('', provider.configured ? 'yes' : 'no'),
      td('', provider.environment || '—'),
      td('', reach),
      td('', (provider.missing || []).join(', ') || '—'),
    );
    body.append(tr);
  }
}

document.getElementById('doctorBtn').addEventListener('click', async () => {
  addBubble('user', 'run integration doctor');
  const out = await api.tool('provider_doctor', {});
  if (!out.ok) {
    addBubble('bot', `Doctor failed: ${out.error}`, 'error');
    return;
  }
  renderDoctor(out.data);
  addBubble('bot', resultLine('provider_doctor', out), 'provider_doctor');
});

async function refresh() {
  const snap = await api.snapshot();
  if (snap.error) throw new Error(snap.error);
  document.getElementById('firmName').textContent = snap.company.name || 'Your business';
  setupInit(snap);
  document.getElementById('firmGstin').textContent = snap.company.gstin;
  document.getElementById('folioMeta').textContent = `FY ${snap.company.fy}`;

  const body = document.getElementById('invoiceRows');
  body.replaceChildren();
  const rows = [...(snap.invoices || []), ...(snap.purchases || [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)));
  if (!rows.length) {
    const tr = document.createElement('tr');
    const empty = td('empty', 'No vouchers yet. Book a purchase or invoice in the strip below.');
    empty.colSpan = 5;
    tr.append(empty);
    body.append(tr);
  }
  for (const inv of rows) {
    const tr = document.createElement('tr');
    const kind = inv.kind === 'purchase' ? 'BILL' : 'INV';
    const voucherCell = document.createElement('td');
    const voucherKind = el('div', '', kind);
    voucherKind.style.color = 'var(--muted)';
    voucherKind.style.fontSize = '.7rem';
    voucherCell.append(el('span', 'kind', inv.id), voucherKind);
    const partyCell = el('td', 'party');
    partyCell.append(document.createTextNode(inv.partyName || ''), el('small', '', inv.partyGstin || 'B2C'));
    const statusCell = document.createElement('td');
    statusCell.append(el('span', statusClass(inv), inv.status || inv.kind || 'posted'));
    tr.append(
      voucherCell,
      partyCell,
      td('', inv.date || ''),
      td('num', `₹${inr(inv.total)}`),
      statusCell,
    );
    tr.dataset.id = inv.id;
    tr.addEventListener('click', async () => {
      const printed = await api.tool('print_invoice', { id: inv.id });
      openPrint(printed.html || printed.data?.html, printed.invoice?.id || inv.id);
    });
    body.append(tr);
  }

  const tb = await api.tool('trial_balance', {});
  const d = tb.data || tb;
  const books = document.getElementById('booksRows');
  books.replaceChildren(...(d.rows || []).map((r) => {
    const tr = document.createElement('tr');
    tr.append(td('kind', r.code), td('', r.name), td('num', inr(r.debitsPosted)), td('num', inr(r.creditsPosted)));
    return tr;
  }));
  const tied = Boolean(d.balanced);
  document.getElementById('booksTie').textContent = tied
    ? `Tied. Dr ₹${inr(d.debit)}  =  Cr ₹${inr(d.credit)}`
    : `Does not tie. Dr ₹${inr(d.debit)}  Cr ₹${inr(d.credit)}`;
  document.getElementById('booksTie').style.color = tied ? 'var(--tie)' : 'var(--warn)';
  document.getElementById('tbLabel').textContent = tied ? 'Books tie' : 'Out of balance';
  const max = Math.max(Number(d.debit) || 0, Number(d.credit) || 0, 1);
  document.getElementById('tbDr').style.width = `${(Number(d.debit) / max) * 100}%`;
  document.getElementById('tbCr').style.width = `${(Number(d.credit) / max) * 100}%`;

  const gst = await api.tool('gst_payable', {});
  const g = gst.data || gst;
  document.getElementById('gstMetrics').replaceChildren(
    metric('Output', `₹${inr(g.output)}`),
    metric('Input (ITC)', `₹${inr(g.input)}`),
    metric('Payable', `₹${inr(g.payable)}`),
  );
  const gstBills = document.getElementById('gstBills');
  const purchases = snap.purchases || [];
  if (purchases.length) {
    gstBills.replaceChildren(...purchases.map((p) => {
      const tr = document.createElement('tr');
      tr.append(td('kind', p.id), td('', p.partyName), td('num', `₹${inr((p.cgst || 0) + (p.sgst || 0) + (p.igst || 0))}`));
      return tr;
    }));
  } else {
    const tr = document.createElement('tr');
    const empty = td('empty', 'No purchase bills. ITC will show here after you book a supplier.');
    empty.colSpan = 3;
    tr.append(empty);
    gstBills.replaceChildren(tr);
  }

  const invN = (snap.invoices || []).length;
  const billN = (snap.purchases || []).length;
  document.getElementById('statInv').textContent = String(invN);
  document.getElementById('statBill').textContent = String(billN);
  document.getElementById('chain').textContent = tied ? 'Dr = Cr' : 'Dr ≠ Cr';

  document.getElementById('toolList').replaceChildren(...(snap.tools || []).map((t) => {
    const item = document.createElement('li');
    item.append(el('b', '', t.title), document.createTextNode(t.description || ''));
    return item;
  }));
  const ossBody = document.getElementById('ossRows');
  ossBody.replaceChildren();
  for (const row of snap.oss || []) {
    const tr = document.createElement('tr');
    tr.append(td('', row.name), td('', row.license), td('', row.decision));
    tr.title = `${row.match} ${row.why}`;
    ossBody.append(tr);
  }
  const gcfg = snap.govt || {};
  const guide = document.getElementById('govtGuide');
  if (guide && gcfg.guide) {
    guide.replaceChildren(...gcfg.guide.map((s) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = s.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = s.title;
      item.append(link, document.createTextNode(` — ${s.do}`));
      return item;
    }));
  }
  if (gcfg.gstin) document.getElementById('gGstin').value = gcfg.gstin;
  if (gcfg.env) document.getElementById('gEnv').value = gcfg.env;
  if (gcfg.username) document.getElementById('gUser').value = gcfg.username;
  renderApiReadiness(snap.integrationReadiness, snap.providerCatalog);
  renderFirm(snap);
  renderClients(snap);
  renderApprovals(snap);
  renderDocuments(snap);
  renderOutbox(snap);
}

document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    const panel = document.getElementById(`panel-${btn.dataset.tab}`);
    if (btn.dataset.tab === 'approvals') renderUsers();
    document.querySelectorAll('.panel').forEach((p) => {
      const on = p === panel;
      p.classList.toggle('on', on);
      p.hidden = !on;
    });
  });
});

document.getElementById('govtProbe').addEventListener('click', async () => {
  addBubble('user', 'probe govt');
  const out = await api.tool('govt_probe', {});
  const d = out.data || out;
  document.getElementById('govtStatus').textContent = `${d.live}/${d.total} hosts answered. ${d.note || ''}`;
  addBubble('bot', (out.ok === false ? out.error : undefined) || `${d.live}/${d.total} government hosts reached.\n${(d.hits || []).map((h) => `${h.id}: ${h.status || h.error}`).join('\n')}`, 'govt_probe');
});

document.getElementById('govtCreds').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await api.tool('govt_save_credentials', {
    env: document.getElementById('gEnv').value,
    clientId: document.getElementById('gClient').value.trim(),
    clientSecret: document.getElementById('gSecret').value,
    username: document.getElementById('gUser').value.trim(),
    password: document.getElementById('gPass').value,
    gstin: document.getElementById('gGstin').value.trim().toUpperCase(),
  });
  addBubble('bot', resultLine('govt_save_credentials', result), 'govt_save_credentials');
});

document.getElementById('gAuth').addEventListener('click', async () => {
  addBubble('user', 'nic auth');
  const result = await api.tool('govt_nic_auth', {});
  addBubble('bot', resultLine('govt_nic_auth', result) + '\n' + JSON.stringify((result.data || result), null, 2).slice(0, 1200), 'govt_nic_auth');
});

document.getElementById('gKey').addEventListener('click', async () => {
  const key = document.getElementById('gPub').value.trim();
  if (!key) {
    addBubble('bot', 'Paste a .cer/.pem path or PEM text first.', 'error');
    return;
  }
  const out = await api.tool('govt_set_public_key', { key });
  addBubble('bot', out.ok ? `NIC public key loaded (${out.data.bits || '?'}-bit RSA).` : `Public key rejected: ${out.error}`, 'govt_set_public_key');
  await refresh();
});

document.getElementById('firmForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = await api.tool('set_company', {
    name: document.getElementById('fName').value.trim(),
    gstin: document.getElementById('fGstin').value.trim().toUpperCase(),
    pan: document.getElementById('fPan').value.trim().toUpperCase(),
    state: document.getElementById('fState').value.trim(),
    fy: document.getElementById('fFy').value.trim(),
    address: document.getElementById('fAddress').value.trim(),
    city: document.getElementById('fCity').value.trim(),
    pin: document.getElementById('fPin').value.trim(),
    entityType: document.getElementById('fEntity').value,
  });
  addBubble('bot', resultLine('set_company', out), 'set_company');
  await refresh();
});

document.getElementById('clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = await api.tool('add_client', {
    clientId: document.getElementById('cId').value.trim(),
    name: document.getElementById('cName').value.trim(),
    gstin: document.getElementById('cGstin').value.trim().toUpperCase(),
    state: document.getElementById('cState').value.trim(),
    entityType: document.getElementById('cEntity').value,
  });
  addBubble('bot', resultLine('add_client', out), 'add_client');
  if (out.ok) {
    for (const id of ['cId', 'cName', 'cGstin', 'cState']) document.getElementById(id).value = '';
  }
  await refresh();
});

document.getElementById('approvalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pinField = document.getElementById('aPin');
  const out = await api.asUser(document.getElementById('aBy').value.trim(), pinField.value, () => api.tool('approval_request', {
    operationId: document.getElementById('aOp').value,
    note: document.getElementById('aNote').value.trim(),
  }));
  pinField.value = '';
  addBubble('bot', resultLine('approval_request', out), 'approval_request');
  await refresh();
});

document.getElementById('docForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('dFile').files[0];
  if (!file) {
    addBubble('bot', 'Choose a file to file as a document.', 'error');
    return;
  }
  const content = await file.text();
  const out = await api.tool('save_document', {
    kind: document.getElementById('dKind').value,
    fileName: file.name,
    contentType: file.type || 'text/plain',
    content,
  });
  addBubble('bot', out.ok
    ? `Filed ${out.data.documentId} · ${out.data.fileName} (${out.data.bytes} bytes).`
    : `Could not file document: ${out.error}`, 'save_document');
  if (out.ok) document.getElementById('dFile').value = '';
  await refresh();
});

document.getElementById('backupBtn').addEventListener('click', async () => {
  const data = await api.backup();
  if (!data || !data.state) {
    addBubble('bot', 'Backup failed.', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `myca-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  addBubble('bot', `Backed up ${(data.state.invoices || []).length} invoices and ${Object.keys(data.documents || {}).length} document(s) to ${a.download}.`, 'backup');
});

document.getElementById('restoreFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    addBubble('bot', 'That file is not valid JSON.', 'error');
    e.target.value = '';
    return;
  }
  if (!window.confirm('Replace the currently open books with this backup? This cannot be undone.')) {
    e.target.value = '';
    return;
  }
  const out = await api.restore({ ...payload, confirm: true });
  addBubble('bot', out.ok
    ? `Restored ${out.restored.invoices} invoices, ${out.restored.clients} client(s), ${out.restored.documents} document(s).`
    : `Restore failed: ${out.error}`, 'restore');
  e.target.value = '';
  await refresh();
});

document.getElementById('printBtn').addEventListener('click', () => {
  const frame = document.getElementById('printFrame');
  if (frame && frame.contentWindow) frame.contentWindow.print();
});

document.getElementById('shareWhatsApp').addEventListener('click', () => shareCurrent('whatsapp'));
document.getElementById('shareEmail').addEventListener('click', () => shareCurrent('email'));

document.getElementById('pdfBtn').addEventListener('click', async () => {
  if (!currentPrint) {
    addBubble('bot', 'Open a voucher first — click a row in Vouchers.', 'error');
    return;
  }
  const bridge = window.myca;
  if (!bridge || typeof bridge.saveInvoicePdf !== 'function') {
    const frame = document.getElementById('printFrame');
    if (frame && frame.contentWindow) frame.contentWindow.print();
    return;
  }
  const res = await bridge.saveInvoicePdf({ html: currentPrint.html, suggestedName: `${currentPrint.name}.pdf` });
  addBubble('bot', res && res.ok
    ? `Saved PDF to ${res.filePath}`
    : (res && res.canceled ? 'PDF save cancelled.' : `PDF export failed: ${res && res.error}`), 'pdf');
});

document.getElementById('apiRows').addEventListener('click', async (e) => {
  const connect = e.target.closest('.api-connect');
  const remove = e.target.closest('.api-remove');
  const target = connect || remove;
  if (!target) return;
  const requirementId = target.dataset.id;
  if (connect) {
    const provider = window.prompt(`Provider for ${requirementId}`, 'Manual connector');
    if (!provider) return;
    const result = await api.tool('integration_connect', { requirementId, provider });
    addBubble('bot', resultLine('integration_connect', result), 'integration_connect');
  } else {
    const result = await api.tool('integration_disconnect', { requirementId });
    addBubble('bot', resultLine('integration_disconnect', result), 'integration_disconnect');
  }
  await refresh();
});

document.getElementById('dlGstr1').addEventListener('click', async () => {
  const out = await api.tool('export_gstr1_json', {});
  const payload = out.data || out;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `GSTR1_${payload.gstin || 'books'}_${payload.fp || 'period'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  addBubble('bot', `Saved GSTR-1 JSON for ${payload.gstin} period ${payload.fp}. Not uploaded to GSTN.`, 'export_gstr1_json');
});

document.getElementById('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const kind = document.getElementById('kind').value;
  await api.attach(kind, f.name, await f.text());
  addBubble('bot', `Attached ${f.name} as ${kind}. Say “import bank”, “import tally”, “import zoho”, “import settlement”, “import amazon orders” or “import pos sales”, and you will see what would post before anything lands.`, kind);
});

document.getElementById('voucher').addEventListener('submit', async (e) => {
  e.preventDefault();
  const kind = document.getElementById('vKind').value;
  const gstChoice = document.getElementById('vGst').value;
  if (gstChoice === '') {
    addBubble('bot', 'Choose the GST rate before booking. Use 0% if none applies.', 'error');
    return;
  }
  const args = {
    partyName: document.getElementById('vParty').value.trim() || 'Walk-in',
    partyGstin: document.getElementById('vGstin').value.trim().toUpperCase(),
    partyState: document.getElementById('vGstin').value.trim().slice(0, 2),
    lines: [{
      description: document.getElementById('vDesc').value.trim() || 'Supply',
      qty: Number(document.getElementById('vQty').value || 1),
      rate: Number(document.getElementById('vRate').value || 0),
      gstRate: Number(gstChoice),
    }],
  };
  if (!args.lines[0].rate) {
    addBubble('bot', 'Enter a rate before booking.', 'error');
    return;
  }
  const name = kind === 'purchase' ? 'create_purchase' : 'create_invoice';
  addBubble('user', `${kind === 'purchase' ? 'Purchase' : 'Invoice'} ${args.partyName} ${args.partyGstin} · ${args.lines[0].qty} × ₹${args.lines[0].rate} · GST ${args.lines[0].gstRate}%`);
  try {
    const result = await api.tool(name, args);
    addBubble('bot', resultLine(name, result), name);
  } catch (err) {
    addBubble('bot', String(err.message || err), 'error');
  }
  await refresh();
});

document.addEventListener('keydown', (e) => {
  const tag = String((e.target && e.target.tagName) || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
  const q = document.getElementById('q');
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    q.focus();
    q.select();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[1-8]$/.test(e.key)) {
    const tab = document.querySelectorAll('.tabs button')[Number(e.key) - 1];
    if (tab) {
      e.preventDefault();
      tab.click();
    }
    return;
  }
  if (!typing && e.key === '/') {
    e.preventDefault();
    q.focus();
    return;
  }
  if (e.key === 'Escape' && e.target === q) {
    q.value = '';
  }
});

document.getElementById('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('composer').requestSubmit();
  }
});

document.getElementById('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('q');
  const message = q.value.trim();
  if (!message) return;
  addBubble('user', message);
  q.value = '';
  try {
    const out = await api.chat(message);
    if (out.error && !out.reply) {
      addBubble('bot', out.error, 'error');
    } else if (out.awaitingConfirmation && out.preview) {
      addPreviewCard(out.preview);
    } else {
      const tag = (out.tools && out.tools[0] && out.tools[0].name) || 'books';
      addBubble('bot', out.reply, tag);
      const printed = out.tools && out.tools[0] && out.tools[0].result;
      if (tag === 'print_invoice' && printed && printed.html) openPrint(printed.html, printed.invoice?.id);
    }
  } catch (err) {
    addBubble('bot', `Chat failed: ${err.message || err}`, 'error');
  }
  await refresh();
});


const INDIAN_STATES = [['01','Jammu and Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],['26','Dadra and Nagar Haveli and Daman and Diu'],['27','Maharashtra'],['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman and Nicobar Islands'],['36','Telangana'],['37','Andhra Pradesh'],['38','Ladakh']];
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

function financialYearToday() {
  const now = new Date();
  const start = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function setupShow(step) {
  const box = document.getElementById('setup');
  box.hidden = false;
  document.getElementById('setupStep1').hidden = step !== 1;
  document.getElementById('setupStep2').hidden = step !== 2;
}

function setupHide() {
  document.getElementById('setup').hidden = true;
}

function setupInit(snap) {
  const company = snap.company || {};
  if (!company.setupNeeded) return;
  setupBind();
  const states = document.getElementById('sState');
  if (!states.options.length) {
    states.append(new Option('Choose the state', ''));
    for (const [code, name] of INDIAN_STATES) states.append(new Option(`${name} (${code})`, code));
  }
  document.getElementById('sFy').value = company.fy || financialYearToday();
  setupShow(1);
  document.getElementById('sName').focus();
}

let setupBound = false;
function setupBind() {
  if (setupBound) return;
  setupBound = true;
document.getElementById('sGstin').addEventListener('input', (e) => {
  const value = e.target.value.trim().toUpperCase();
  e.target.value = value;
  if (value.length >= 2 && /^\d{2}/.test(value)) document.getElementById('sState').value = value.slice(0, 2);
  if (value.length >= 12) document.getElementById('sPan').value = value.slice(2, 12);
});

document.getElementById('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = document.getElementById('setupError');
  error.hidden = true;
  const name = document.getElementById('sName').value.trim();
  const gstin = document.getElementById('sGstin').value.trim().toUpperCase();
  const state = document.getElementById('sState').value;
  const pan = document.getElementById('sPan').value.trim().toUpperCase();
  const say = (text) => { error.textContent = text; error.hidden = false; };
  if (!name) return say('Enter the business name.');
  if (gstin && !GSTIN_SHAPE.test(gstin)) return say('A GSTIN is 15 characters: two digits, the PAN, a letter, a character, Z, a character.');
  if (!gstin && !state) return say('Choose the state the business is in.');
  const button = document.getElementById('setupContinue');
  button.disabled = true;
  try {
    const out = await fetch('/api/company', { method: 'POST', headers: apiHeaders, body: JSON.stringify({ name, gstin, ...(state ? { state } : {}), ...(pan ? { pan } : {}), fy: document.getElementById('sFy').value }) }).then((r) => r.json());
    if (out.ok === false) {
      const words = { INVALID_GSTIN: 'That GSTIN does not check out; the last character is a check digit, so one wrong letter shows here.', INVALID_PAN: 'A PAN is five letters, four digits and a letter.', INVALID_STATE_CODE: 'Choose a state from the list.' };
      return say(words[out.error] || `That did not go through (${String(out.error || '').toLowerCase().replace(/_/g, ' ')}).`);
    }
    await refresh();
    setupShow(2);
  } finally {
    button.disabled = false;
  }
});

for (const choice of document.querySelectorAll('.setup-choice[data-import]')) {
  choice.addEventListener('click', () => {
    const file = document.getElementById('setupFile');
    file.dataset.kind = choice.dataset.import;
    file.dataset.say = choice.dataset.say;
    file.value = '';
    file.click();
  });
}

document.getElementById('setupFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const note = document.getElementById('setupNote');
  note.hidden = false;
  note.textContent = `Reading ${f.name}…`;
  await api.attach(e.target.dataset.kind, f.name, await f.text());
  setupHide();
  addBubble('bot', `Attached ${f.name}. Here is what it holds; nothing is in the books until you say yes.`, 'setup');
  sendChat(e.target.dataset.say);
});

document.getElementById('setupFresh').addEventListener('click', () => {
  setupHide();
  addBubble('bot', 'Fresh books. Try: "invoice Retail Mart 8000 GST 18%", or "paid 12000 rent", or attach a bank statement from the strip below.', 'setup');
});
}

document.getElementById('reviewerForm')?.addEventListener('submit', (event) => event.preventDefault());

refresh().then(() => {
  addBubble('bot', 'Books are open. Book a voucher in the strip, or ask for trial balance / GSTR-1 JSON.', 'ready');
}).catch((err) => {
  addBubble('bot', `Could not load books: ${err.message || err}`, 'error');
});
