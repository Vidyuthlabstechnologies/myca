import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_book.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import '../../widgets/qr_image.dart';
import 'my_einvoice_create_screen.dart';
import 'my_widgets.dart';

String myDateTime(String iso) {
  final at = DateTime.tryParse(iso);
  if (at == null) return iso;
  final local = at.toUtc().add(const Duration(hours: 8));
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year} ${two(local.hour)}:${two(local.minute)}';
}

class MyEinvoiceDetailScreen extends StatefulWidget {
  const MyEinvoiceDetailScreen({super.key, required this.record});

  final MyEinvoice record;

  @override
  State<MyEinvoiceDetailScreen> createState() => _MyEinvoiceDetailScreenState();
}

class _MyEinvoiceDetailScreenState extends State<MyEinvoiceDetailScreen> {
  late MyEinvoice _record = widget.record;
  bool _busy = false;
  bool _asked = false;
  String _error = '';
  String _note = '';
  Timer? _tick;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_asked) {
      _asked = true;
      _tick = Timer.periodic(const Duration(minutes: 1), (_) {
        if (mounted) setState(() {});
      });
      if (_pending && _record.submissionUid.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
      } else if (_needsDetails) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _loadDetails());
      }
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  bool get _pending => const {'submitted', 'in progress', 'inprogress', 'pending', ''}.contains(_record.status);

  bool get _needsDetails {
    final record = _record;
    if (record.uuid.isEmpty) return false;
    if (record.status == 'invalid' && record.errors.isEmpty) return true;
    if (record.valid && (record.link.isEmpty || (record.validatedAt.isEmpty && record.until.isEmpty))) return true;
    return false;
  }

  Future<void> _loadDetails() async {
    final tools = MyTools(AppScope.of(context).api);
    try {
      final found = await tools.details(_record.uuid, direction: _record.direction);
      if (!mounted) return;
      final record = _record;
      _save(MyEinvoice(
        number: record.number.isEmpty ? found.number : record.number,
        submissionUid: record.submissionUid,
        uuid: record.uuid,
        status: found.status.isEmpty ? record.status : found.status,
        errors: found.errors.isEmpty ? record.errors : found.errors,
        totals: record.totals ?? found.totals,
        environment: record.environment,
        at: record.at.isEmpty ? found.at : record.at,
        validatedAt: found.validatedAt.isEmpty ? record.validatedAt : found.validatedAt,
        link: found.link.isEmpty ? record.link : found.link,
        buyerName: record.buyerName.isEmpty ? found.buyerName : record.buyerName,
        supplierName: record.supplierName.isEmpty ? found.supplierName : record.supplierName,
        direction: record.direction,
        type: record.type,
        kind: record.kind,
        until: record.until,
        reason: record.reason.isEmpty ? found.reason : record.reason,
      ));
    } catch (_) {
      return;
    }
  }

  void _save(MyEinvoice record) {
    rememberEinvoice(AppScope.of(context), record);
    setState(() => _record = record);
  }

  Future<void> _refresh() async {
    if (_busy || _record.submissionUid.isEmpty) return;
    final t = MyStrings.of(context);
    final tools = MyTools(AppScope.of(context).api);
    setState(() {
      _busy = true;
      _error = '';
      _note = '';
    });
    try {
      final docs = await tools.status(_record.submissionUid);
      final mine = docs.where((doc) => (doc.uuid.isNotEmpty && doc.uuid == _record.uuid) || doc.number == _record.number);
      if (mounted && mine.isNotEmpty) _save(_record.withStatus(mine.first));
    } catch (error) {
      if (mounted) setState(() => _error = myErrorMessage(t, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share() async {
    final t = MyStrings.of(context);
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final shared = await state.shareText(_record.link).catchError((Object _) => false);
    if (shared) return;
    await Clipboard.setData(ClipboardData(text: _record.link));
    messenger.showSnackBar(SnackBar(content: Text(t.shareFailed)));
  }

  Future<void> _reasonAction({required bool reject}) async {
    final t = MyStrings.of(context);
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ReasonSheet(
        title: reject ? t.rejectTitle(_record.number) : t.cancelTitle(_record.number),
        label: reject ? t.rejectReason : t.cancelReason,
        action: reject ? t.rejectAtLhdn : t.cancelAtLhdn,
      ),
    );
    if (reason == null || reason.trim().isEmpty || !mounted) return;
    final tools = MyTools(AppScope.of(context).api);
    setState(() {
      _busy = true;
      _error = '';
      _note = '';
    });
    try {
      if (reject) {
        await tools.reject(_record.uuid, reason);
        if (mounted) _save(_record.rejected(reason));
        if (mounted) setState(() => _note = t.rejectedDone);
      } else {
        await tools.cancel(_record.uuid, reason);
        if (mounted) _save(_record.cancelled());
        if (mounted) setState(() => _note = t.cancelledDone);
      }
    } catch (error) {
      if (mounted) setState(() => _error = myErrorMessage(t, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    final state = AppScope.of(context);
    final record = _record;
    final left = myCancelLeft(record, state.now());
    final canAct = record.valid && record.uuid.isNotEmpty;
    final open = canAct && left > Duration.zero;
    final totals = record.totals;
    final money = totals == null || totals.currency == 'MYR' ? ringgit : (num value) => '${totals.currency} ${value.toStringAsFixed(2)}';
    final (body, tone) = switch (record.status) {
      'valid' => (t.statusValidBody, MyTone.good),
      'invalid' => (t.statusInvalidBody, MyTone.danger),
      'rejected' => (t.statusRejectedBody, MyTone.danger),
      'rejection requested' => (t.statusRejectionRequestedBody, MyTone.warn),
      'cancelled' => (t.statusCancelledBody, MyTone.info),
      _ => (t.statusProgressBody, MyTone.warn),
    };
    return Scaffold(
      appBar: AppBar(title: Text(t.detailTitle(record.number), maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              if (mySandbox(context) || record.sandbox) ...[MyNote(t.sandboxBanner), const SizedBox(height: 12)],
              MyPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 10,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(t.documentTypeName(record.type), style: text.labelLarge?.copyWith(color: palette.muted)),
                        MyStatusChip(record.status, key: const Key('myDetail.status')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(record.number, style: text.headlineSmall),
                    if ((record.received ? record.supplierName : record.buyerName).isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text('${record.received ? t.supplier : t.buyer}: ${record.received ? record.supplierName : record.buyerName}', style: text.bodyLarge),
                    ],
                    if (totals != null) ...[
                      const SizedBox(height: 8),
                      if (!totals.payableOnly) ...[
                        MyAmountLine(label: t.net, amount: money(totals.net)),
                        MyAmountLine(label: t.tax, amount: money(totals.tax)),
                      ],
                      MyAmountLine(label: t.payable, amount: money(totals.payable), strong: true),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              MyNote(body, tone: tone),
              if (record.reason.isNotEmpty) ...[const SizedBox(height: 8), Text('${t.reasonGiven}: ${record.reason}', style: text.bodyMedium)],
              if (record.errors.isNotEmpty) ...[
                const SizedBox(height: 12),
                MyProblems(key: const Key('myDetail.errors'), title: t.whatLhdnSaid, problems: [for (final line in record.errors) MyProblem.fromBlocker(line)]),
              ],
              if (_note.isNotEmpty) ...[const SizedBox(height: 12), MyNote(_note, tone: MyTone.good)],
              if (_error.isNotEmpty) ...[const SizedBox(height: 12), MyErrorBox(message: _error, onRetry: _refresh)],
              if (record.valid && record.link.isNotEmpty) ...[
                MySection(t.qrTitle),
                Center(
                  child: Container(
                    key: const Key('myDetail.qr'),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: const Color(0xFFFFFFFF), borderRadius: BorderRadius.circular(12)),
                    child: SizedBox.square(dimension: 180, child: CustomPaint(painter: QrPainter(record.link))),
                  ),
                ),
                const SizedBox(height: 8),
                SelectableText(record.link, textAlign: TextAlign.center, style: text.bodySmall?.copyWith(color: palette.muted)),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(key: const Key('myDetail.share'), onPressed: _share, icon: const Icon(Icons.share_outlined), label: Text(t.shareLink)),
                ),
              ],
              if (record.submissionUid.isNotEmpty && record.status != 'cancelled') ...[
                const SizedBox(height: 12),
                MyBusyButton(key: const Key('myDetail.refresh'), label: t.refreshStatus, busyLabel: t.checkingStatus, busy: _busy, onPressed: _refresh, outlined: true),
              ],
              if (canAct) ...[
                MySection(record.received ? t.rejectEinvoice : t.cancelEinvoice),
                if (open) ...[
                  Text(record.received ? t.rejectWindow(left.inHours, left.inMinutes % 60) : t.cancelWindow(left.inHours, left.inMinutes % 60), key: const Key('myDetail.countdown'), style: text.bodyMedium),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      key: const Key('myDetail.cancel'),
                      style: OutlinedButton.styleFrom(foregroundColor: palette.danger),
                      onPressed: _busy ? null : () => _reasonAction(reject: record.received),
                      child: Text(record.received ? t.rejectEinvoice : t.cancelEinvoice),
                    ),
                  ),
                ] else ...[
                  MyNote(t.cancelClosed, tone: MyTone.warn, icon: Icons.lock_clock_outlined),
                  if (!record.received) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        key: const Key('myDetail.creditNote'),
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => MyEinvoiceCreateScreen(type: 'credit-note', original: record))),
                        child: Text(t.issueCreditNote),
                      ),
                    ),
                  ],
                ],
              ],
              MySection(t.submission),
              if (record.uuid.isNotEmpty) _Meta(label: t.uuid, value: record.uuid),
              if (record.submissionUid.isNotEmpty) _Meta(label: t.submission, value: record.submissionUid),
              if (record.at.isNotEmpty) _Meta(label: t.sentAt, value: myDateTime(record.at)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.labelMedium?.copyWith(color: context.myca.muted)),
          SelectableText(value, style: text.bodyMedium),
        ],
      ),
    );
  }
}

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({required this.title, required this.label, required this.action});

  final String title;
  final String label;
  final String action;

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final _reason = TextEditingController();
  String _error = '';

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final t = MyStrings.of(context);
    if (_reason.text.trim().isEmpty) return setState(() => _error = t.cancelReasonMissing);
    Navigator.of(context).pop(_reason.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final palette = context.myca;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(
                key: const Key('myReason.field'),
                controller: _reason,
                autofocus: true,
                maxLength: 300,
                maxLines: 3,
                minLines: 1,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(labelText: widget.label, helperText: t.cancelReasonHelp, helperMaxLines: 2, errorText: _error.isEmpty ? null : _error, errorMaxLines: 2),
              ),
              const SizedBox(height: 12),
              FilledButton(key: const Key('myReason.submit'), style: FilledButton.styleFrom(backgroundColor: palette.danger), onPressed: _submit, child: Text(widget.action)),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: Text(t.keepIt)),
            ],
          ),
        ),
      ),
    );
  }
}
