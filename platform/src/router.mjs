import { TOOLS, runTool } from './tools.mjs';
import { planLocalToolCall, validateAssistantToolCall } from './assistant-contract.mjs';

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
  if (name === 'sandbox_status') {
    if (!d.configured) {
      return `Quicko Sandbox is NOT configured. Configure MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET in platform/.env.`;
    }
    if (d.ok) {
      return `Quicko Sandbox API (${d.baseUrl}) connected successfully in ${d.ms}ms. Authentication active.`;
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
  if (name === 'validate_gstin') {
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
  if (name === 'govt_save_credentials') {
    return `Saved NIC credentials for ${d.gstin || '(no GSTIN)'} (${d.env}). Password stored only on this PC.`;
  }
  if (name === 'company_profile') {
    return `${d.company.name}  GSTIN ${d.company.gstin}  FY ${d.company.fy}\nInvoices ${d.invoices} · purchases ${d.purchases ?? 0} · checksum ${d.chain.ok ? 'intact' : 'BROKEN'}.`;
  }
  const text = JSON.stringify(d, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…truncated` : text;
}

export async function chat(state, message) {
  const plan = planLocalToolCall(state, message);
  if (plan.kind === 'reply') return { reply: plan.reply, tools: plan.tools || [], blocked: plan.blocked || false };

  const valid = validateAssistantToolCall(plan.name, plan.args);
  if (!valid.ok) return { reply: `Tool ${plan.name} blocked: ${valid.error}`, tools: [], blocked: true };

  const result = await runTool(state, plan.name, plan.args);
  if (plan.clearsPendingFile) state.pendingFile = null;
  if (plan.name === 'print_invoice') {
    return {
      reply: result.ok ? `Printable ${result.invoice.id} for ${result.invoice.partyName}, total ${money(result.invoice.total)}.` : fmtToolResult(plan.name, result),
      tools: [{ name: plan.name, result }],
    };
  }
  if (plan.fallback) {
    return {
      reply: `I did not match that. ${fmtToolResult('company_profile', result)}\n\nTry “probe govt” or “purchase from Fabrics Co GSTIN 27AABCT1332L1ZM, 2 rolls at 10000, GST 5%”.`,
      tools: [{ name: plan.name, result }],
    };
  }
  return { reply: fmtToolResult(plan.name, result), tools: [{ name: plan.name, result }] };
}

export { fmtToolResult, TOOLS };
