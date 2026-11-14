import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../theme.dart';

const _processingNotes = {
  'processed': 'The portal accepted every invoice.',
  'processed_with_errors': 'The portal refused some invoices. Fix them and save again.',
  'error': 'The portal could not process the save. Save again.',
  'in_progress': 'The portal is still processing. Check again in a minute.',
};

String _clock(DateTime at) {
  final local = at.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.hour)}:${two(local.minute)}';
}

class GstPortalScreen extends StatefulWidget {
  const GstPortalScreen({super.key, required this.period, this.gstin = '', this.form = 'gstr1'});

  final String period;
  final String gstin;
  final String form;

  @override
  State<GstPortalScreen> createState() => _GstPortalScreenState();
}

class _GstPortalScreenState extends State<GstPortalScreen> {
  final _username = TextEditingController();
  final _loginOtp = TextEditingController();
  final _evcOtp = TextEditingController();
  GstPortalStatus? _status;
  String _error = '';
  String _note = '';
  String _busy = '';
  bool _otpSent = false;
  bool _saved = false;
  bool _submitted = false;
  bool _evcSent = false;
  String _processing = '';
  String _ack = '';
  List<Map<String, dynamic>> _sections = const [];
  bool _loaded = false;
  bool _paid = false;
  bool _liabilityRead = false;
  String _taxLine = '';

  bool get _is3b => widget.form == 'gstr3b';

  String get _formName => _is3b ? 'GSTR-3B' : 'GSTR-1';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loaded) {
      _loaded = true;
      _reload();
    }
  }

  @override
  void dispose() {
    _username.dispose();
    _loginOtp.dispose();
    _evcOtp.dispose();
    super.dispose();
  }

  CloudSession get _cloud => AppScope.of(context).cloud!;

  GstPortalSession? get _session => _status?.sessionFor(widget.gstin);

  String get _gstin => _session?.gstin ?? widget.gstin;

  Future<void> _reload() async {
    try {
      final status = await _cloud.gstPortalStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _error = '';
        final session = status.sessionFor(widget.gstin);
        if (session != null && _username.text.isEmpty) _username.text = session.username;
        _otpSent = session?.waitingForOtp ?? false;
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<Map<String, dynamic>?> _run(String doing, Future<Map<String, dynamic>> Function() action) async {
    setState(() {
      _busy = doing;
      _error = '';
      _note = '';
    });
    try {
      return await action();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
      return null;
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _sendLoginOtp() async {
    final out = await _run('Asking the portal for an OTP…', () => _cloud.gstPortalConnect('otp', gstin: widget.gstin, username: _username.text.trim()));
    if (out == null || !mounted) return;
    setState(() {
      _otpSent = true;
      _note = '${out['hint'] ?? 'The GST portal sent an OTP.'}';
    });
  }

  Future<void> _verifyLoginOtp() async {
    final out = await _run('Checking the OTP…', () => _cloud.gstPortalConnect('verify', gstin: _gstin, otp: _loginOtp.text.trim()));
    if (out == null || !mounted) return;
    _loginOtp.clear();
    await _reload();
    if (mounted) setState(() => _note = 'Connected to the GST portal.');
  }

  Future<void> _disconnect() async {
    final out = await _run('Disconnecting…', () => _cloud.gstPortalConnect('disconnect', gstin: _gstin));
    if (out == null || !mounted) return;
    await _reload();
    if (mounted) {
      setState(() {
        _otpSent = false;
        _note = 'Disconnected from the GST portal.';
      });
    }
  }

  String _operation(String step) => '${_is3b ? 'gstr3b' : 'gstr1'}_$step';

  Future<Map<String, dynamic>> _withApproval(String step, String otp) async {
    final operation = _operation(step);
    final rows = await _cloud.filingApprovals(operation, widget.period);
    for (final row in rows.where((row) => row['status'] == 'approved')) {
      final out = await _cloud.returnStep(widget.form, step, period: widget.period, gstin: _gstin, otp: otp, caApprovalId: '${row['approvalId']}');
      if (out['error'] != 'CA_APPROVAL_REQUIRED') return out;
    }
    final pending = rows.where((row) => row['status'] == 'pending').toList();
    if (pending.isEmpty) {
      await _cloud.requestFilingApproval(operation, widget.period, gstin: _gstin);
      return {'ok': false, 'awaitingApproval': 'asked'};
    }
    final approvalId = '${pending.first['approvalId']}';
    final decided = await _cloud.approve(approvalId);
    if (decided['error'] == 'MAKER_CHECKER_VIOLATION') return {'ok': false, 'awaitingApproval': 'waiting'};
    if (decided['ok'] != true) throw MycaApiException(cloudMessage('${decided['error'] ?? 'UNKNOWN'}', '${decided['hint'] ?? ''}'));
    return _cloud.returnStep(widget.form, step, period: widget.period, gstin: _gstin, otp: otp, caApprovalId: approvalId);
  }

  Future<Map<String, dynamic>?> _step(String step, String doing, {String otp = ''}) async {
    var out = await _run(doing, () => _cloud.returnStep(widget.form, step, period: widget.period, gstin: _gstin, otp: otp));
    if (out != null && out['error'] == 'CA_APPROVAL_REQUIRED') out = await _run('Checking the approval for this step…', () => _withApproval(step, otp));
    if (out != null && out['awaitingApproval'] != null) {
      final asked = out['awaitingApproval'] == 'asked';
      if (mounted) {
        setState(() => _note = asked
            ? 'This business is in live mode, so this step needs a second person. Asked for approval: an owner or your accountant, other than you, opens this return and taps the same step to approve it.'
            : 'Waiting for an owner or your accountant, other than you, to approve this step.');
      }
      return null;
    }
    if (out == null && _error.contains('session ended')) await _reload();
    return out;
  }

  Future<void> _save() async {
    final out = await _step('save', 'Saving the $_formName to the portal…');
    if (out == null || !mounted) return;
    final sections = out['sections'] is Map ? (out['sections'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    setState(() {
      if (_is3b) {
        _taxLine = gstr3bTaxLine(sections);
        _paid = false;
        _liabilityRead = false;
      }
      _saved = true;
      _submitted = false;
      _evcSent = false;
      _processing = '';
      _sections = const [];
      _note = _is3b ? 'Saved to the portal. Read the tax the portal works out next.' : 'Saved to the portal. Check it next.';
    });
  }

  Future<void> _liability() async {
    final out = await _step('liability', 'Reading the tax the portal works out…');
    if (out == null || !mounted) return;
    setState(() {
      _liabilityRead = true;
      _note = 'The portal has worked out the tax. Pay it from credit and cash next.';
    });
  }

  String get _simulatedLead => AppScope.of(context).testServer ? 'Simulated: this is the test environment, so nothing reaches the GST portal. ' : '';

  Future<void> _pay() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Pay the GSTR-3B tax for ${monthLabel(widget.period)}?'),
        content: Text('${_simulatedLead}The portal uses your input tax credit first, then the cash ledger. This cannot be undone. Pay any cash shortfall by challan (PMT-06) before this step.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Pay')),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    final out = await _step('offset', 'Setting off the tax…');
    if (out == null || !mounted) return;
    setState(() {
      _paid = true;
      _note = 'Tax set off: ${rupees(out['creditUsed'] as num? ?? 0)} from credit and ${rupees(out['cashPaid'] as num? ?? 0)} from cash. Send the EVC OTP next.';
    });
  }

  Future<void> _check() async {
    final out = await _step('check', 'Checking with the portal…');
    if (out == null || !mounted) return;
    final processing = '${out['processing'] ?? ''}';
    setState(() {
      _processing = processing;
      _note = _processingNotes[processing] ?? 'The portal says: $processing.';
    });
  }

  Future<void> _submit() async {
    final out = await _step('submit', 'Submitting…');
    if (out == null || !mounted) return;
    setState(() {
      _submitted = true;
      _note = 'Submitted. Read the portal summary before filing.';
    });
    await _summary();
  }

  Future<void> _summary() async {
    final out = await _step('summary', 'Reading the portal summary…');
    if (out == null || !mounted) return;
    final rows = out['sections'];
    setState(() {
      _sections = [
        if (rows is List)
          for (final row in rows)
            if (row is Map) row.cast<String, dynamic>(),
      ];
    });
  }

  Future<void> _sendEvc() async {
    final out = await _step('otp', 'Asking the portal for the EVC OTP…');
    if (out == null || !mounted) return;
    setState(() {
      _evcSent = true;
      _note = 'The portal sent the EVC OTP to the authorised signatory.';
    });
  }

  Future<void> _file() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('File $_formName for ${monthLabel(widget.period)}?'),
        content: Text('$_simulatedLead${_is3b ? 'Filing cannot be undone. Check the tax and the credit first.' : 'Filing cannot be undone. Check the portal summary first.'}'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('File')),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    final out = await _step('file', 'Filing…', otp: _evcOtp.text.trim());
    if (out == null || !mounted) return;
    _evcOtp.clear();
    setState(() {
      _ack = '${out['ackNum'] ?? ''}';
      _note = out['simulated'] == true ? 'Filed (simulated). Reference $_ack is practice only: nothing was sent to the GST portal.' : 'Filed. Acknowledgement $_ack.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final status = _status;
    final session = _session;
    final busy = _busy.isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Text('File on the GST portal'),
        actions: [
          IconButton(tooltip: 'Refresh', onPressed: busy ? null : _reload, icon: const Icon(Icons.refresh, size: 22)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text('$_formName for ${monthLabel(widget.period)}${_gstin.isEmpty ? '' : ' · $_gstin'}', style: text.titleMedium),
          const SizedBox(height: 8),
          if (status == null && _error.isEmpty) const LinearProgressIndicator(),
          if (status != null && !status.available)
            Text(cloudMessage(status.reason), style: text.bodyLarge)
          else if (status != null) ...[
            if (status.mode != 'live')
              Text(
                status.simulated ? 'Practice mode: nothing is sent to the GST portal.' : 'Test portal: this uses the GST sandbox, not your real return.',
                style: text.bodySmall?.copyWith(color: Palette.danger),
              ),
            const SizedBox(height: 12),
            if (session == null || !session.connected) ..._connect(text, session) else ..._filing(text, session),
          ],
          if (_busy.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_busy, style: text.bodyMedium),
          ],
          if (_note.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_note, style: text.bodyMedium?.copyWith(color: Palette.ink)),
          ],
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_error, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
          ],
        ],
      ),
    );
  }

  List<Widget> _connect(TextTheme text, GstPortalSession? session) {
    final busy = _busy.isNotEmpty;
    return [
      Text(
        session?.needsReconnect == true ? 'The portal session ended. Ask for a new OTP to reconnect.' : 'Connect this GSTIN to the GST portal.',
        style: text.bodyLarge,
      ),
      const SizedBox(height: 6),
      Text('First, on gst.gov.in open My Profile → Manage API Access and turn API access on.', style: text.bodySmall),
      const SizedBox(height: 12),
      TextField(
        key: const ValueKey('gstPortal.username'),
        controller: _username,
        decoration: const InputDecoration(labelText: 'GST portal username'),
        textInputAction: TextInputAction.done,
      ),
      const SizedBox(height: 10),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton(onPressed: busy ? null : _sendLoginOtp, child: Text(_otpSent ? 'Send the OTP again' : 'Send OTP')),
      ),
      if (_otpSent) ...[
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('gstPortal.otp'),
          controller: _loginOtp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: 'OTP from the GST portal'),
        ),
        SizedBox(
          width: double.infinity,
          child: FilledButton(onPressed: busy ? null : _verifyLoginOtp, child: const Text('Connect')),
        ),
      ],
    ];
  }

  List<Widget> _filing(TextTheme text, GstPortalSession session) {
    final busy = _busy.isNotEmpty;
    final expires = session.expiresAt;
    final filed = _ack.isNotEmpty;
    Widget button(String label, VoidCallback? onPressed, {bool primary = false}) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: SizedBox(
            width: double.infinity,
            child: primary ? FilledButton(onPressed: busy ? null : onPressed, child: Text(label)) : OutlinedButton(onPressed: busy ? null : onPressed, child: Text(label)),
          ),
        );
    return [
      Text('Connected as ${session.username}${expires == null ? '' : ' until ${_clock(expires)}'}. MyCA keeps the session alive while API access stays on.', style: text.bodyMedium),
      const SizedBox(height: 8),
      if (_is3b) ..._gstr3bSteps(text, button, filed) else ...[
        button('1. Save to the portal', filed ? null : _save),
        button('2. Check the save', _saved && !filed ? _check : null),
        button('3. Submit', _saved && !_submitted && !filed && _processing != 'processed_with_errors' && _processing != 'error' ? _submit : null),
        if (_sections.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('PORTAL SUMMARY', style: text.labelSmall),
          for (final row in _sections)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('${row['section']}: ${row['records']} ${row['records'] == 1 ? 'record' : 'records'}, value ${rupees(row['value'] as num? ?? 0)}, tax ${rupees(row['tax'] as num? ?? 0)}', style: text.bodyMedium),
            ),
        ],
        button('4. Send the EVC OTP', _submitted && !filed ? _sendEvc : null),
      ],
      if (_evcSent && !filed) ...[
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('gstPortal.evc'),
          controller: _evcOtp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: 'EVC OTP'),
        ),
        button(_is3b ? '5. File GSTR-3B' : '5. File GSTR-1', _file, primary: true),
      ],
      const SizedBox(height: 16),
      TextButton(onPressed: busy ? null : _disconnect, child: const Text('Disconnect the GST portal')),
    ];
  }

  List<Widget> _gstr3bSteps(TextTheme text, Widget Function(String, VoidCallback?, {bool primary}) button, bool filed) => [
        button('1. Save to the portal', filed ? null : _save),
        if (_taxLine.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_taxLine, style: text.bodyMedium),
          ),
        button('2. Read the tax the portal works out', _saved && !filed ? _liability : null),
        button('3. Pay the tax', _liabilityRead && !_paid && !filed ? _pay : null),
        button('4. Send the EVC OTP', _paid && !filed ? _sendEvc : null),
      ];
}

String gstr3bTaxLine(Map<String, dynamic> sections) {
  final outward = sections['outward'] is Map ? (sections['outward'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
  final credit = sections['credit'] is Map ? (sections['credit'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
  num sum(Map<String, dynamic> row) => ['iamt', 'camt', 'samt', 'csamt'].fold<num>(0, (total, key) => total + (row[key] as num? ?? 0));
  return 'Outward taxable ${rupees(outward['txval'] as num? ?? 0)}, tax ${rupees(sum(outward))}, credit ${rupees(sum(credit))}.';
}
