import { TOOLS, runTool } from './tools.mjs';
import { planLocalToolCall, validateAssistantToolCall } from './assistant-contract.mjs';
import { needsConfirmation, previewOf, openPending, takePending, clearPending, previewReply, blockedReply } from './chat-confirm.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { referenceImportContent, resolveImportContent } from './import-documents.mjs';

function money(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function fmtToolResult(name, result) {
  if (!result || result.ok === false) return `Tool ${name} failed: ${result?.error || JSON.stringify(result)}`;
  const d = result.data ?? result.invoice ?? result;
  if (name === 'create_invoice' && result.invoice) {
    const i = result.invoice;
    return `Posted ${i.id} to ${i.partyName} on ${i.date} for ${money(i.total)} (taxable ${money(i.taxable)}, GST ${money(i.cgst + i.sgst + i.igst)}). Books updated from the invoice.`;
  }
  if (name === 'add_reminder' && result.reminder) {
    return `Set. On ${result.reminder.due}: ${result.reminder.text}.`;
  }
  if (name === 'complete_reminder' && result.reminder) {
    return `Done: ${result.reminder.text}.`;
  }
  if (name === 'list_reminders' && result.data) {
    const rows = result.data.reminders;
    if (!rows.length) return 'You have no open reminders.';
    const when = { overdue: 'Overdue', today: 'Today', later: 'On' };
    return rows.map((item) => `· ${item.state === 'later' ? `${when.later} ${item.due}` : when[item.state]}: ${item.text} (${item.id})`).join('\n');
  }
  if (name === 'books_check' && result.data) {
    const mark = { act: 'Needs you', check: 'Check', ok: 'Fine' };
    const lines = result.data.findings.map((item) => `· ${mark[item.severity]}: ${item.title}. ${item.detail}`);
    return [result.data.headline + '.', ...lines].join('\n');
  }
  if (name === 'gst_review_answer' && result.review) {
    const review = result.review;
    if (result.approved) return `Approved the ${review.month} figures. Nothing has been filed. Save the GSTR-1 file from Taxes, or send it to your CA.`;
    if (result.answer === 'wrong') return `Noted that it is not right. Fix the entries; the review starts again from that step when the figures change.`;
    const next = review.steps.find((step) => step.id === review.next);
    return next ? `Confirmed. Next: ${next.title}. Say "review GST" to see it.` : 'Confirmed.';
  }
  if (name === 'create_purchase' && result.invoice) {
    const i = result.invoice;
    return `Booked ${i.id} from ${i.partyName} for ${money(i.total)}. ITC ${money(i.cgst + i.sgst + i.igst)} posted to GST input. It will appear in the folio as a bill.`;
  }
  if (name === 'filing_pack') {
    return `Filing pack ${d.period || ''} for ${d.gstin}. GSTR-1 taxable ${money(d.gstr1?.totalTaxable)}. GST payable ${money(d.payable)}. ${d.caveat}`;
  }
  if (name === 'trial_balance') {
    const rows = (d.rows || []).map((r) => `${r.code}  ${String(r.name).padEnd(28)}  Dr ${money(r.debitsPosted)}  Cr ${money(r.creditsPosted)}`).join('\n');
    return `Trial balance ${d.balanced ? 'ties' : 'DOES NOT TIE'}.\nDr ${money(d.debit)}   Cr ${money(d.credit)}\n\n${rows}`;
  }
  if (name === 'gst_payable') {
    return `GST output ${money(d.output)} − input ${money(d.input)} = payable ${money(d.payable)}.`;
  }
  if (name === 'list_invoices') {
    const list = (Array.isArray(d) ? d : []).map((i) => `${i.id}  ${i.date}  ${i.partyName}  ${money(i.total)}  ${i.status}`).join('\n');
    return list || 'No invoices yet.';
  }
  if (name === 'export_gstr1_json') {
    return `GSTR-1 JSON gstin ${d.gstin} fp ${d.fp}. B2B ${d.b2b?.length || 0} parties, B2CS ${d.b2cs?.length || 0} rows. ${d.caveat}`;
  }
  if (name === 'import_tally_xml') {
    return `Tally XML: ${d.converted?.count ?? 0} vouchers → ${d.ledger?.posted ?? 0} ledger posts.`;
  }
  if (name === 'prepare_gstr1') {
    const g = d.gstr1;
    if (!g) return JSON.stringify(d);
    return `GSTR-1 ${g.period || ''} taxable ${money(g.totalTaxable)}. B2B ${g.tables.b2b.length}, B2CL ${g.tables.b2cl.length}, B2CS ${g.tables.b2cs.length}. E-invoice issues: ${g.errors.length}.`;
  }
  if (name === 'deadlines') {
    const next = (d.deadlines || []).slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 8);
    return next.map((x) => `${x.returnType} ${x.period} due ${x.dueDate} (${x.level || x.escalation || ''})`).join('\n') || 'No deadlines.';
  }
  if (name === 'audit_books') {
    if (!d.summary) return result.error || JSON.stringify(d);
    return `Audit ${d.summary.flags} flags (high ${d.summary.high} / medium ${d.summary.medium} / low ${d.summary.low}).`;
  }
  if (name === 'import_tally' || name === 'import_bank') {
    return `${name}: ${d.rows?.length ?? 0} parsed, ${d.ledger?.posted ?? 0} posted to the ledger.`;
  }
  if (name === 'govt_probe') {
    if (d.ok === false) return `Govt probe not run: ${d.error}${d.hint ? `
${d.hint}` : ''}`;
    return `Reached ${d.live}/${d.total} government hosts.\n${(d.hits || []).map((h) => `${h.id}  HTTP ${h.status || h.error}  ${h.ms}ms`).join('\n')}\n\n${d.note}`;
  }
  if (name === 'govt_nic_auth') {
    return d.ok ? `NIC auth OK (${d.env}).` : `NIC auth not complete: ${d.error || d.hint}\n${d.hint || ''}`;
  }
  if (name === 'govt_nic_mock') {
    if (!d.ok) return `Mock NIC failed: ${d.error}`;
    return `NIC Sandbox Mock: IRN generated for Doc ${d.payload?.DocDtls?.No}.\nIRN: ${d.irn}\nAck No: ${d.ackNo} (${d.ackDate})\nQR Code generated (${d.signedQrCode.slice(0, 32)}…).\n[Simulated NIC Session — No live NIC certificate required]`;
  }
  if (name === 'govt_generate_irn') {
    if (d.mock) {
      return `NIC Sandbox Mock: IRN generated for Doc ${d.payload?.DocDtls?.No}.\nIRN: ${d.irn}\nAck No: ${d.ackNo} (${d.ackDate})\n[Simulated NIC Session]`;
    }
    return d.ok ? `IRN issued for payload Doc ${d.payload?.DocDtls?.No}.` : `IRN not issued: ${d.error || JSON.stringify(d.nic || d.auth).slice(0, 500)}`;
  }
  if (name === 'integration_readiness') {
    const topMissing = (d.rows || []).filter((row) => row.status === 'missing').slice(0, 6).map((row) => row.title).join(', ');
    const ids = (d.missingRequirementIds || []).slice(0, 6).join(', ');
    return `API readiness: ${d.available}/${d.total} connected. Must-have missing: ${d.mustHaveMissing.length}. ${d.next}${ids ? `\nMissing IDs: ${ids}.` : ''}${topMissing ? `\nMissing next: ${topMissing}.` : ''}`;
  }
  if (name === 'integration_connect') {
    return `Connected ${d.connection.requirementId} (${d.connection.id}) via ${d.connection.provider}. API readiness is now ${d.readiness.available}/${d.readiness.total}.`;
  }
  if (name === 'integration_disconnect') {
    return `Disconnected ${d.requirementId}. API readiness is now ${d.readiness.available}/${d.readiness.total}.`;
  }
  if (name === 'provider_catalog') {
    const rows = (d.requirements || []).map((req) => {
      const owners = (req.existingOwners || []).slice(0, 3).join(', ');
      return `${req.requirementId}: ${req.capability}\n  owners: ${owners}`;
    }).join('\n');
    return `${d.name} provider map (${d.posture}).\nDocs: ${d.docsUrl}\n${rows}\n\nAdapters must wrap these existing owners; they must not duplicate filing or reconciliation logic.`;
  }
  if (name === 'sandbox_adapter_plan') {
    const rows = (d.operations || []).map((operation) => {
      const gate = operation.caApprovalRequired ? 'CA approval required' : 'read/prepare allowed';
      const tools = operation.mapsToTools?.length ? operation.mapsToTools.join(', ') : 'provider session/audit only';
      return `${operation.operationId} (${operation.requirementId}): ${operation.title}\n  ${gate}; tools: ${tools}; owners: ${operation.ownerModules.join(', ')}`;
    }).join('\n');
    return `Sandbox adapter plan: ${d.operations.length} operation(s). No external API call was made.\n${rows}`;
  }
  if (name === 'sandbox_operation') {
    if (!d.ok) return `Sandbox ${d.operationId || 'operation'} not run: ${d.error}${d.hint ? ` ${d.hint}` : ''}`;
    return `Sandbox ${d.operationId} (${d.requirementId}) completed.\n${JSON.stringify(d.data).slice(0, 500)}`;
  }
  if (name === 'approval_request') {
    return `Approval ${d.approval.approvalId} opened for ${d.approval.operationId} (pending). A reviewer must approve it before it can authorise a live operation.`;
  }
  if (name === 'approval_decide') {
    return `Approval ${d.approval.approvalId} ${d.approval.status} by ${d.approval.decidedBy}.`;
  }
  if (name === 'approval_list') {
    const rows = (d.approvals || []).map((a) => `${a.approvalId}  ${a.operationId}  ${a.status}`).join('\n');
    return rows || 'No approval requests.';
  }
  if (name === 'provider_doctor') {
    const rows = (d.providers || []).map((p) => {
      const state = p.configured ? 'configured' : 'missing';
      const reach = p.reachability?.status === 'ok' ? `reachable ${p.reachability.ms}ms` : (p.reachability?.status || '');
      const miss = p.missing?.length ? ` · missing: ${p.missing.join(', ')}` : '';
      return `${p.id} (${(p.requirements || []).join('/')}): ${state}${p.environment ? ` [${p.environment}]` : ''} ${reach}${miss}`;
    }).join('\n');
    return `Integration doctor — ${d.summary.configured}/${d.summary.providers} configured, ${d.summary.reachable} reachable. Live calls ${d.liveCallsEnabled ? 'ON' : 'off'}.\n${rows}`;
  }
  if (name === 'govt_set_public_key') {
    return d.ok ? `NIC public key loaded (${d.bits || '?'}-bit RSA).` : `Public key rejected: ${d.error}`;
  }
  if (name === 'test_notification') {
    return `Test ${d.message?.channel || 'notification'} → ${d.message?.status || 'queued'}${d.error ? ` (${d.error})` : ''}.`;
  }
  if (name === 'sandbox_status') {
    if (!d.configured) {
      return `Quicko Sandbox is NOT configured. Configure MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET in platform/.env.`;
    }
    if (d.error === 'LIVE_CALLS_DISABLED') {
      return `Quicko Sandbox is configured (${d.baseUrl}) but live outbound calls are disabled. ${d.hint}`;
    }
    if (d.ok) {
      const env = d.environment === 'live' ? 'LIVE' : 'TEST';
      const warn = d.environment === 'live'
        ? ''
        : '\nNote: Sandbox TEST environment — responses are provider fixtures, not real taxpayer data.';
      return `Quicko Sandbox API connected — ${env} (${d.baseUrl}) in ${d.ms}ms via ${d.keySource}.${warn}`;
    }
    return `Quicko Sandbox connection failed: ${d.error || 'Unknown error'} (${d.ms}ms).`;
  }
  if (name === 'sandbox_connect') {
    return `Connected Quicko Sandbox for ${d.connected.join(', ')}. API readiness is now ${d.readiness.available}/${d.readiness.total}.`;
  }
  if (name === 'nim_status') {
    if (!d.configured) {
      return `NVIDIA NIM: Not configured. Model target is ${d.model}. ${d.hint}`;
    }
    if (d.error === 'LIVE_CALLS_DISABLED') {
      return `NVIDIA NIM is configured (${d.model}) but live outbound calls are disabled. ${d.hint}`;
    }
    if (d.ok) {
      return `NVIDIA NIM connected (${d.model}) in ${d.ms}ms. Ready for free inference.`;
    }
    return `NVIDIA NIM connection check failed: ${d.error || 'Unknown error'}`;
  }
  if (name === 'nim_ask') {
    if (!d.ok) {
      return `NVIDIA NIM request failed: ${d.error}.\n${d.hint || ''}`;
    }
    return `[NVIDIA NIM · ${d.model}]\n${d.reply}`;
  }
  if (name === 'validate_gstin' || name === 'search_gstin') {
    if (!d.ok) {
      const errList = (d.errors || []).map((e) => (typeof e === 'object' ? (e.message || e.code || JSON.stringify(e)) : String(e))).join(', ');
      return `GSTIN ${d.gstin || ''} is INVALID: ${errList || 'checksum or format invalid'}.`;
    }
    const lines = [
      `GSTIN: ${d.gstin} (${d.stateName || d.stateCode}) — Check digit valid, PAN ${d.pan}.`,
    ];
    if (d.liveVerified) {
      lines.push(`Legal Name: ${d.legalName || 'N/A'}`);
      if (d.tradeName && d.tradeName !== d.legalName) lines.push(`Trade Name: ${d.tradeName}`);
      lines.push(`Status: ${d.status} | Type: ${d.taxpayerType || 'Regular'} | E-Invoice: ${d.eInvoiceStatus || 'N/A'}`);
      if (d.natureOfBusiness?.length) lines.push(`Nature of Business: ${d.natureOfBusiness.join(', ')}`);
      lines.push(`[Verified live via Quicko Sandbox]`);
    } else if (d.liveError) {
      lines.push(`[Offline check passed; live lookup: ${d.liveError}]`);
    } else if (d.liveReason) {
      lines.push(`[Offline check passed; ${d.liveReason}]`);
    }
    return lines.join('\n');
  }
  if (name === 'track_gst_returns') {
    if (!d.ok) return `Track GST returns failed: ${d.error || 'Unknown error'}${d.hint ? ` (${d.hint})` : ''}`;
    const rows = (d.returns || []).map((r) => `${String(r.rtntype || '').padEnd(8)} ${String(r.ret_prd || '').padEnd(8)} ${String(r.dof || '').padEnd(12)} ${String(r.arn || '').padEnd(18)} ${r.status || 'Filed'}`).join('\n');
    return `GST return track for ${d.gstin} (${d.financialYear || ''}) — ${d.count} filed return(s):\n${rows || 'No filed returns found.'}${d.mock ? '\n[Mock Data — Simulated Portal Session]' : ''}`;
  }
  if (name === 'govt_save_credentials') {
    return `Saved NIC credentials for ${d.gstin || '(no GSTIN)'} (${d.env}). Secrets are stored encrypted in the ${d.vault || 'local'} vault on this PC.`;
  }
  if (name === 'exceptions') {
    const s = d.summary || { count: 0, bySeverity: {}, moneyAtRisk: 0 };
    if (!s.count) return `Nothing needs attention in ${d.scope === 'firm' ? 'the firm' : d.clientId || 'these books'} as of ${d.asOfDate}.`;
    const counts = ['critical', 'high', 'medium', 'low'].filter((k) => s.bySeverity[k]).map((k) => `${s.bySeverity[k]} ${k}`).join(', ');
    const rows = (d.exceptions || []).slice(0, 12).map((e) => {
      const worth = e.moneyAtRisk ? `  ${money(e.moneyAtRisk)}` : '';
      return `${e.id}  ${String(e.severity).padEnd(8)}${e.clientId === 'SELF' ? '' : `${e.clientId}  `}${e.title}${worth}\n    ${e.why}`;
    }).join('\n');
    const more = (d.exceptions || []).length > 12 ? `\n… and ${d.exceptions.length - 12} more.` : '';
    return `${s.count} open (${counts}), ${money(s.moneyAtRisk)} at risk as of ${d.asOfDate}${d.reconciled ? ', including GSTR-2B findings' : ''}.\n\n${rows}${more}`;
  }
  if (name === 'exception_decide') {
    const e = d.exception;
    return `${e.id} is now ${e.status}${e.owner ? ` with ${e.owner}` : ''}. ${e.note || ''}`.trim();
  }
  if (name === 'company_profile') {
    return `${d.company.name}  GSTIN ${d.company.gstin}  FY ${d.company.fy}\nInvoices ${d.invoices} · purchases ${d.purchases ?? 0} · checksum ${d.chain.ok ? 'intact' : 'BROKEN'}.`;
  }
  const text = JSON.stringify(d, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…truncated` : text;
}

async function runPlanned(state, name, args, clearsPendingFile) {
  const runArgs = name === 'sandbox_operation' ? { ...args, actorId: 'assistant' } : args;
  const result = await runTool(state, name, runArgs);
  if (clearsPendingFile) state.pendingFile = null;
  return result;
}

function unreadableFile(error) {
  return { reply: `I could not read that file (${error}), so nothing was posted.`, tools: [], posted: false, blocked: true, error };
}

function holdForConfirmation(state, plan) {
  const resolved = resolveImportContent(state, plan.name, plan.args);
  if (!resolved.ok) return unreadableFile(resolved.error);
  const schemaCheck = validateAssistantToolCall(plan.name, resolved.args);
  if (!schemaCheck.ok) return { reply: `Tool ${plan.name} blocked: ${schemaCheck.error}`, tools: [], blocked: true };
  const preview = previewOf(state, plan.name, resolved.args);
  if (preview.blockers.length) {
    clearPending(state);
    return { reply: blockedReply(preview), tools: [], posted: false, blocked: true, preview };
  }
  const pending = openPending(state, { ...plan, args: referenceImportContent(state, plan.name, plan.args) }, preview);
  return {
    reply: previewReply(preview, pending),
    tools: [],
    posted: false,
    awaitingConfirmation: true,
    preview: { token: pending.token, tool: pending.name, summary: preview.summary, effects: preview.effects, figures: preview.figures },
  };
}

// A form on the phone already knows the tool and its arguments, so it skips the
// text parser but not the preview: the same token must come back before anything posts.
export function propose(state, name, args = {}) {
  if (!needsConfirmation(name)) {
    return { reply: `${String(name)} is not an action that is previewed.`, tools: [], posted: false, blocked: true, error: 'NOT_PROPOSABLE' };
  }
  return holdForConfirmation(state, { name, args: args && typeof args === 'object' ? args : {} });
}

const NOTHING_PENDING = 'There is nothing waiting to be posted.';
const CONFIRM_TOKEN = /^[0-9a-f]{12}$/;

async function runConfirmation(state, decision) {
  const taken = takePending(state, decision);
  if (!taken.ok) {
    const why = taken.error === 'EXPIRED'
      ? 'That preview is more than ten minutes old, so I discarded it. Say it again if you still want it.'
      : taken.error === 'TOKEN_MISMATCH'
        ? 'That confirmation code does not match the preview I am holding, so I discarded it.'
        : NOTHING_PENDING;
    return { reply: why, tools: [], posted: false, error: taken.error };
  }
  const { pending } = taken;
  const resolved = resolveImportContent(state, pending.name, pending.args);
  if (!resolved.ok) return unreadableFile(resolved.error);
  const recheck = validateAssistantToolCall(pending.name, resolved.args);
  if (!recheck.ok) return { reply: `Tool ${pending.name} blocked: ${recheck.error}`, tools: [], blocked: true };
  const result = await runPlanned(state, pending.name, resolved.args, pending.clearsPendingFile);
  const out = { reply: fmtToolResult(pending.name, result), tools: [{ name: pending.name, result }], posted: result.ok !== false, confirmed: true };
  state.lastConfirmation = { token: pending.token, tool: pending.name, reply: out.reply, posted: out.posted };
  return out;
}

// A phone on a poor connection will send the same confirmation twice. The second
// one must report what the first one did, not post again and not look like a failure.
export async function confirmPending(state, token) {
  const code = String(token == null ? '' : token).trim().toLowerCase();
  if (!CONFIRM_TOKEN.test(code)) {
    return { reply: 'A confirmation needs the code from its preview.', tools: [], posted: false, error: 'TOKEN_REQUIRED' };
  }
  const last = state.lastConfirmation;
  if (last && last.token === code && state.pendingChatAction?.token !== code) {
    return { reply: last.reply, tools: [], posted: last.posted, confirmed: true, replayed: true };
  }
  return runConfirmation(state, { token: code });
}

export function discardPending(state) {
  const pending = state.pendingChatAction;
  if (!pending) return { reply: NOTHING_PENDING, tools: [], posted: false };
  clearPending(state);
  return { reply: `Discarded: ${pending.summary || 'nothing was posted'}`, tools: [], posted: false };
}

export async function chat(state, message) {
  const plan = planLocalToolCall(state, message);
  if (plan.kind === 'reply') return { reply: plan.reply, tools: plan.tools || [], blocked: plan.blocked || false };

  if (plan.kind === 'cancel') return discardPending(state);

  if (plan.kind === 'confirm') return runConfirmation(state, plan.decision);

  if (needsConfirmation(plan.name)) return holdForConfirmation(state, plan);

  const valid = validateAssistantToolCall(plan.name, plan.args);
  if (!valid.ok) return { reply: `Tool ${plan.name} blocked: ${valid.error}`, tools: [], blocked: true };

  const runArgs = plan.name === 'sandbox_operation' ? { ...plan.args, actorId: 'assistant' } : plan.args;
  const result = await runTool(state, plan.name, runArgs);
  if (plan.clearsPendingFile) state.pendingFile = null;
  if (plan.name === 'print_invoice') {
    return {
      reply: result.ok ? `Printable ${result.invoice.id} for ${result.invoice.partyName}, total ${money(result.invoice.total)}.` : fmtToolResult(plan.name, result),
      tools: [{ name: plan.name, result }],
    };
  }
  if (plan.fallback) {
    if (liveCallsEnabled() || mockModeEnabled()) {
      const ask = await runTool(state, 'nim_ask', { prompt: message });
      if (ask.ok && ask.data?.reply) {
        return {
          reply: ask.data.reply,
          tools: [{ name: 'nim_ask', result: ask }],
        };
      }
    }
    return {
      reply: `I did not match that. ${fmtToolResult('company_profile', result)}\n\nTry “probe govt” or “purchase from Fabrics Co GSTIN 27AABCT1332L1ZE, 2 rolls at 10000, GST 5%”.`,
      tools: [{ name: plan.name, result }],
    };
  }
  return { reply: fmtToolResult(plan.name, result), tools: [{ name: plan.name, result }] };
}

export { fmtToolResult, TOOLS };
