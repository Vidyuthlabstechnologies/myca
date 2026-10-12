import { TOOLS, runTool } from './tools.mjs';
import { planLocalToolCall, validateAssistantToolCall } from './assistant-contract.mjs';
import { needsConfirmation, previewOf, openPending, takePending, clearPending, previewReply, blockedReply } from './chat-confirm.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { referenceImportContent, resolveImportContent } from './import-documents.mjs';
import { spoken } from './words.mjs';
import { planEntryWithTds } from './tds-intent.mjs';
import { paymentWords } from './gst-payment.mjs';
import { inWords as monthWords } from './words.mjs';

function money(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
}

const FAILURES = {
  PERIOD_LOCKED: (r) => `That date is in a period that is closed${r.lockThrough ? ` (up to ${r.lockThrough})` : ''}, so nothing was changed.`,
  INVALID_DATE: () => 'That is not a date I can read, so nothing was changed.',
  DUPLICATE_ID: (r) => `${r.id || 'That number'} is already used in these books, so nothing was changed.`,
  INVOICE_NOT_FOUND: () => 'That invoice is not in these books, so nothing was changed.',
  BILL_NOT_FOUND: () => 'That bill is not in these books, so nothing was changed.',
  BAD_AMOUNT: () => 'That amount does not work here, so nothing was changed.',
  OVERPAYMENT: (r) => `That is more than is owed${r.due != null ? ` (${money(r.due)})` : ''}, so nothing was changed.`,
  RATE_REQUIRED: () => 'A GST rate is needed for each item; MyCA does not assume one. Nothing was changed.',
  NO_LINES: () => 'There is nothing to put on it, so nothing was changed.',
  ZERO_AMOUNT: () => 'It comes to nothing, so nothing was changed.',
  INSUFFICIENT_CASH: (r) => `There is not that much cash in hand${r.inHand != null ? ` (${money(r.inHand)})` : ''}. Nothing was changed.`,
};

function notAccepted(error) {
  const text = String(error || '');
  if (/gstRate is required/.test(text)) return 'A GST rate is needed for each item; MyCA does not assume one. Nothing was changed.';
  if (/partyName/.test(text)) return 'Say who it is with. Nothing was changed.';
  if (/amount|rate|qty/.test(text) && /minimum|exclusiveMinimum|number/.test(text)) return 'One of the amounts is not a usable number. Nothing was changed.';
  return 'Some of the details were missing or not in the right form, so nothing was changed.';
}

function failedInWords(code, result = {}) {
  const plain = FAILURES[code];
  if (plain) return plain(result || {});
  return `That did not go through${code ? ` (${code})` : ''}, so nothing was changed.`;
}

function fmtToolResult(name, result) {
  if (result?.error === 'SALARIES_PRIVATE') return 'Only the owner can see or change employees and salaries.';
  if (!result || result.ok === false) return failedInWords(result?.error, result);
  const d = result.data ?? result.invoice ?? result;
  if (name === 'create_invoice' && result.invoice) {
    const i = result.invoice;
    return `Posted ${i.id} to ${i.partyName} on ${i.date} for ${money(i.total)} (${money(i.taxable)} plus ${money(i.cgst + i.sgst + i.igst)} GST).`;
  }
  if (name === 'can_afford' && result.data) {
    const d = result.data;
    const head = { yes: 'Yes.', tight: 'Yes, but it is tight.', no: 'Not on these figures.' }[d.verdict];
    const covered = d.monthsCovered == null ? '' : ` That is about ${d.monthsCovered} ${d.monthsCovered === 1 ? 'month' : 'months'} of your usual outgoings.`;
    const lines = [
      `${head} You would have about ${money(d.balanceThen)} on ${d.on}. After spending ${money(d.amount)}, the lowest point in the month after is ${money(d.left)}.${covered}`,
      d.verdict === 'yes' ? '' : `To keep a month of outgoings in hand, spend up to ${money(d.safeToSpend)} then.`,
      ...d.notes.map((note) => `· ${note}`),
    ];
    return lines.filter(Boolean).join('\n');
  }
  if (name === 'cash_forecast' && result.data) {
    const d = result.data;
    return [
      `Bank and cash now: ${money(d.start.amount)}. In ${d.days} days: about ${money(d.end)}.`,
      `Coming in: ${money(d.coming.total)}. Going out: ${money(d.going.total)}. Lowest point: ${money(d.lowest.amount)} on ${d.lowest.date}.`,
      d.overdue.total > 0 ? `Overdue and not counted: ${money(d.overdue.total)}.` : '',
      ...d.notes.map((note) => `· ${note}`),
    ].filter(Boolean).join('\n');
  }
  if (name === 'create_quote' && result.quote) {
    return `Quote ${result.quote.id} to ${result.quote.partyName} for ${money(result.quote.total)}, valid until ${result.quote.validUntil}. Nothing was posted to your books.`;
  }
  if (name === 'mark_quote' && result.quote) {
    return `${result.quote.id} marked ${result.quote.status}.`;
  }
  if (name === 'convert_quote' && result.invoice) {
    return `Posted ${result.invoice.id} to ${result.invoice.partyName} for ${money(result.invoice.total)} from quote ${result.quote.id}.`;
  }
  if (name === 'ask_ca' && result.request) {
    return `Sent to your CA in MyCA (${result.request.id}). You will see the reply under Your CA.`;
  }
  if (name === 'reply_ca' && result.request) {
    return `Replied on ${result.request.title}.`;
  }
  if (name === 'close_ca' && result.request) {
    return `Closed: ${result.request.title}.`;
  }
  if (name === 'set_payment_terms' && result.ok) {
    return `Noted. ${result.customer}: ${result.label}. New invoices to them will show a due date.`;
  }
  if (name === 'set_cash_balance' && result.reading) {
    return `Noted. On ${result.reading.on}: bank ${money(result.reading.bank)}, cash in hand ${money(result.reading.cash)}. The forecast starts from here.`;
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
  if (name === 'record_receipt' && result.invoice) {
    const i = result.invoice;
    const last = (i.receipts || []).at(-1) || {};
    const received = (i.receipts || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    return `Recorded ${money(last.amount)} received from ${i.partyName} by ${last.mode || 'bank'} on ${last.date} against ${i.id}. ${i.status === 'paid' ? `${i.id} is paid in full.` : `${money(received)} of ${money(i.total)} received so far.`}`;
  }
  if (name === 'post_expense' && result.expense) {
    const e = result.expense;
    return `Posted ${e.id}: ${money(e.amount)} ${e.description ? `for ${e.description} ` : ''}from ${e.mode === 'cash' ? 'cash' : 'the bank'} on ${e.date}, under ${e.headName}.${e.inputCredit ? ` Input credit ${money((e.cgst || 0) + (e.sgst || 0) + (e.igst || 0))}.` : ''}${e.tds?.amount ? ` ${money(e.tds.amount)} TDS under ${e.tds.section} held back; ${money(e.amount - e.tds.amount)} paid.` : ''}`;
  }
  if (name === 'set_expense_head' && result.expense) {
    const e = result.expense;
    return result.unchanged ? `${e.id} is already under ${e.headName}.` : `Moved ${e.id} to ${e.headName}.`;
  }
  if (name === 'create_debit_note' && result.debitNote) {
    const n = result.debitNote;
    return `Debit note ${n.id} for ${money(n.total)} against ${n.invoiceId} (${n.partyName}, ${n.date}). ${n.partyName} now owes ${money(result.outstanding)}.`;
  }
  if (name === 'create_purchase_note' && result.purchaseNote) {
    const n = result.purchaseNote;
    return `Debit note ${n.id} to ${n.partyName} for ${money(n.total)} against ${n.billId} (${n.date}).${result.refundDue > 0 ? ` ${money(result.refundDue)} was already paid and is now due back to you.` : ` You owe ${money(result.outstanding)} on it now.`}`;
  }
  if ((name === 'create_credit_note' || name === 'cancel_invoice') && result.creditNote) {
    const n = result.creditNote;
    const head = n.cancels ? `Cancelled ${n.invoiceId} with credit note ${n.id}` : `Credit note ${n.id} for ${money(n.total)} against ${n.invoiceId}`;
    return `${head} (${n.partyName}, ${n.date}).${result.refundDue > 0 ? ` ${money(result.refundDue)} was already received and is now due back to ${n.partyName}.` : ''}`;
  }
  if (name === 'gst_payable' && result.data) {
    return paymentWords(result.data, money, monthWords);
  }
  if (name === 'set_gst_credit_opening' && result.opening) {
    const o = result.opening;
    return `Recorded the GST credit balance at the start of ${monthWords(o.period)}: IGST ${money(o.igst)}, CGST ${money(o.cgst)}, SGST ${money(o.sgst)}. Set-off from that month on counts it.`;
  }
  if (name === 'tds_review_answer' && result.review) {
    const review = result.review;
    if (result.approved) return `Approved the ${review.period} TDS statement. Nothing has been filed. ${review.shortfall > 0 ? `${money(review.shortfall)} is still to deposit before it can be filed.` : 'File it on the TRACES or income-tax portal, or send it to your CA, and record the acknowledgement.'}`;
    if (result.answer === 'wrong') return 'Noted that it is not right. Fix the entries; the review starts again from that step when the figures change.';
    const next = review.steps.find((step) => step.id === review.next);
    return next ? `Confirmed. Next: ${next.title}. Say "review TDS" to see it.` : 'Confirmed.';
  }
  if (name === 'tds_return' && result.data) {
    const d = result.data;
    if (d.empty) return `Nothing was deducted in ${d.quarter}.`;
    const rows = d.sections.map((s) => `· ${s.section}: ${s.deductees === 1 ? '1 deductee' : `${s.deductees} deductees`}, ${money(s.tds)}`).join('\n');
    return `TDS statement for ${d.quarter}${d.form ? ` (Form ${d.form})` : ''}: deducted ${money(d.deducted)}, deposited ${money(d.deposited)}${d.shortfall > 0 ? `, still to deposit ${money(d.shortfall)}` : ''}.${d.filed ? ` Recorded as filed on ${d.filed.filedOn}, ARN ${d.filed.arn}.` : d.dueDate ? ` Due by ${d.dueDate}.` : ''}\n${rows}\nSay "review TDS" to check it step by step.`;
  }
  if (name === 'set_tds_deductor' && result.tan) {
    return `Done. This business deducts TDS under TAN ${result.tan}.`;
  }
  if (name === 'record_tds_deposit' && result.deposit) {
    const d = result.deposit;
    return `Recorded the TDS deposit of ${money(d.amount)} on ${d.date}, challan ${d.challan}.${result.left > 0.005 ? ` ${money(result.left)} is still to deposit.` : ' Nothing is left to deposit.'}`;
  }
  if (name === 'tds_summary' && result.data) {
    const d = result.data;
    if (!d.deductor) return 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN to start.';
    const months = d.months.map((m) => `· ${m.month}: deducted ${money(m.deducted)}${m.depositBy ? `, deposit by ${m.depositBy}` : ''}`).join('\n');
    return `TDS deducted ${money(d.deducted)}, deposited ${money(d.deposited)}, still to deposit ${money(d.due)}.${months ? `\n${months}` : ''}`;
  }
  if (name === 'add_employee' && result.employee) {
    const e = result.employee;
    return `Added ${e.name} as ${e.id}, at ${money(e.salary[0].monthly)} a month from ${e.joinedOn}. No payroll has been run.`;
  }
  if (name === 'change_salary' && result.salary) {
    return `${result.employee.name} is at ${money(result.salary.monthly)} a month from ${result.salary.from}.`;
  }
  if (name === 'end_employment' && result.employee) {
    return `Recorded that ${result.employee.name} left on ${result.employee.leftOn}.`;
  }
  if (name === 'list_employees' && result.data) {
    const rows = result.data.employees;
    return rows.length
      ? `${rows.length === 1 ? '1 employee' : `${rows.length} employees`}, ${money(result.data.monthlyTotal)} a month before deductions:\n${rows.map((e) => `· ${e.id} ${e.name}${e.designation ? `, ${e.designation}` : ''}: ${money(e.monthly)}`).join('\n')}`
      : 'No employees yet. Say, for example, "add employee Ravi Kumar joined 2026-09-01 salary 25000".';
  }
  if (name === 'record_supplier_reminder' && result.reminder) {
    const r = result.reminder;
    return `Reminder ${r.id} to ${r.supplier} for ${r.period} is ready to send from your phone. Nothing has gone from MyCA.`;
  }
  if (name === 'supplier_reminder_draft' && result.data) {
    return result.data.message;
  }
  if (name === 'list_filings' && result.data) {
    return result.data.length
      ? `Recorded as filed:\n${result.data.slice(0, 12).map((f) => `· ${f.label} for ${f.period}: ${f.filedOn}, ARN ${f.arn}${f.late ? ' (after the due date)' : ''}`).join('\n')}`
      : 'No filing is recorded yet. When a return is filed, say so with its ARN, for example "filed GSTR-1 for September, ARN AA2909261234567".';
  }
  if (name === 'record_filing' && result.filing) {
    const f = result.filing;
    return `Recorded ${f.label} for ${f.period} as filed on ${f.filedOn}, ARN ${f.arn}.${f.late ? ` That was after its due date of ${f.dueDate}.` : ''} MyCA did not file anything.`;
  }
  if (name === 'record_payment' && result.bill) {
    const b = result.bill;
    return `Paid ${b.partyName} ${money(result.payment.amount)} against ${b.id} by ${result.payment.mode} on ${result.payment.date}. ${result.remaining > 0.005 ? `${money(result.remaining)} is still owed on it.` : `${b.id} is paid in full.`}`;
  }
  if (name === 'create_purchase' && result.invoice) {
    const i = result.invoice;
    return `Booked ${i.id} from ${i.partyName} for ${money(i.total)}${i.itcEligible === false ? '. The GST on it cannot be claimed, so it is part of the cost.' : `, with ${money(i.cgst + i.sgst + i.igst)} of GST counted as input credit.`}${i.tds?.amount ? ` ${money(i.tds.amount)} TDS under ${i.tds.section} is held back, so ${money(i.total - i.tds.amount)} is owed to ${i.partyName}.` : ''}`;
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
    return `${name === 'import_bank' ? 'Bank statement' : name === 'import_tally' ? 'Tally data' : 'File'} brought in: ${d.rows?.length ?? 0} ${(d.rows?.length ?? 0) === 1 ? 'row' : 'rows'} read, ${d.ledger?.posted ?? 0} posted to your books.`;
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
  if (!schemaCheck.ok) return { reply: notAccepted(schemaCheck.error), tools: [], blocked: true };
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
function proposeCore(state, name, args = {}) {
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
  if (!recheck.ok) return { reply: notAccepted(recheck.error), tools: [], blocked: true };
  const result = await runPlanned(state, pending.name, resolved.args, pending.clearsPendingFile);
  const out = { reply: fmtToolResult(pending.name, result), tools: [{ name: pending.name, result }], posted: result.ok !== false, confirmed: true };
  state.lastConfirmation = { token: pending.token, tool: pending.name, reply: out.reply, posted: out.posted };
  return out;
}

// A phone on a poor connection will send the same confirmation twice. The second
// one must report what the first one did, not post again and not look like a failure.
async function confirmCore(state, token) {
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

function discardCore(state) {
  const pending = state.pendingChatAction;
  if (!pending) return { reply: NOTHING_PENDING, tools: [], posted: false };
  clearPending(state);
  return { reply: `Not posted: ${pending.summary || 'nothing was waiting'}`, tools: [], posted: false };
}

async function chatCore(state, message) {
  const plan = planEntryWithTds((text) => planLocalToolCall(state, text), message);
  if (plan.kind === 'reply') return { reply: plan.reply, tools: plan.tools || [], blocked: plan.blocked || false };

  if (plan.kind === 'cancel') return discardCore(state);

  if (plan.kind === 'confirm') return runConfirmation(state, plan.decision);

  if (needsConfirmation(plan.name)) return holdForConfirmation(state, plan);

  const valid = validateAssistantToolCall(plan.name, plan.args);
  if (!valid.ok) return { reply: notAccepted(valid.error), tools: [], blocked: true };

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
      reply: 'I did not match that to anything I can do, so nothing was recorded. Try "invoice Kiran Stores 50000 GST 18%", "paid 12000 rent", "who owes me?", or say "help" for more.',
      tools: [{ name: plan.name, result }],
    };
  }
  return { reply: fmtToolResult(plan.name, result), tools: [{ name: plan.name, result }] };
}

export function propose(state, name, args = {}) {
  return spoken(proposeCore(state, name, args));
}

export async function confirmPending(state, token) {
  return spoken(await confirmCore(state, token));
}

export function discardPending(state) {
  return spoken(discardCore(state));
}

export async function chat(state, message) {
  return spoken(await chatCore(state, message));
}

export { fmtToolResult, TOOLS };
