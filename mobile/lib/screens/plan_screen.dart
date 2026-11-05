import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';

bool get buyInApp => defaultTargetPlatform != TargetPlatform.iOS;

const featureWords = {
  'books': 'Books, invoices and bills',
  'gst-returns': 'GST returns prepared for your CA',
  'chat': 'Ask MyCA in plain words',
  'einvoice': 'E-invoices (IRN) and GSTIN checks',
  'connectors': 'Amazon, Shopify, Razorpay, Zoho and bank connections',
  'whatsapp': 'Ask and post on WhatsApp',
  'team': 'Staff and your accountant in the same books',
  'priority-support': 'Priority support',
};

String planLimits(PlanOffer plan) {
  final invoices = plan.invoicesPerMonth == null ? 'Unlimited invoices' : '${plan.invoicesPerMonth} invoices a month';
  final people = plan.members == null ? 'any number of people' : plan.members == 1 ? 'just you' : 'up to ${plan.members} people';
  return '$invoices, $people';
}

String entitlementLine(Entitlement e) {
  if (e.trialDaysLeft != null) return 'Free trial of ${e.planTitle}: ${e.trialDaysLeft} ${e.trialDaysLeft == 1 ? 'day' : 'days'} left.';
  if (e.status == 'created') return 'Checkout started for ${e.planTitle}. Finish paying on the Razorpay page to start the plan.';
  if (e.status == 'halted') return 'The last payment failed, so this business is on Free until it is paid.';
  if (e.paying) return 'You are on ${e.planTitle}${e.currentEnd.length >= 10 ? ', paid to ${e.currentEnd.substring(0, 10)}' : ''}.';
  return 'You are on ${e.planTitle}.';
}

class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key});

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  List<PlanOffer>? _plans;
  Entitlement? _entitlement;
  String _error = '';
  String _note = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_plans == null && !_busy && _error.isEmpty) _reload();
  }

  Future<void> _reload() async {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final plans = await cloud.plans();
      final entitlement = await cloud.entitlement();
      if (mounted) {
        setState(() {
          _plans = plans;
          _entitlement = entitlement;
        });
      }
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _subscribe(PlanOffer plan) async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final url = await state.cloud!.subscribe(plan.id);
      final opened = url.isNotEmpty && await state.openLink(Uri.parse(url));
      if (mounted) setState(() => _note = opened ? 'Finish paying on the Razorpay page. Your plan starts as soon as Razorpay confirms it.' : 'Open this link to pay: $url');
      await _reload();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    final cloud = AppScope.of(context).cloud!;
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Cancel the plan?'),
        content: const Text('The plan stays until the end of the period you paid for, then this business moves to Free. Your books stay as they are.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Keep it')),
          TextButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Cancel plan')),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final atEnd = await cloud.cancelSubscription();
      if (mounted) setState(() => _note = atEnd ? 'Cancelled. The plan runs to the end of this period.' : 'Cancelled.');
      await _reload();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final owner = AppScope.of(context).snapshot?.activeUser?.role == 'owner';
    final plans = _plans;
    final e = _entitlement;
    return Scaffold(
      appBar: AppBar(title: const Text('Plan and billing')),
      body: plans == null || e == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(24), child: Text(_error, textAlign: TextAlign.center, style: text.bodyMedium?.copyWith(color: Palette.danger))),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Text(entitlementLine(e), style: text.titleMedium),
                if (e.testMode) ...[
                  const SizedBox(height: 6),
                  Text('Billing is in test mode: no real money is taken.', style: text.bodyMedium?.copyWith(color: Palette.warn)),
                ],
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_note, style: text.bodyMedium),
                ],
                for (final plan in plans) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(plan.id == e.plan ? '${plan.title} (current)' : plan.title, style: text.titleMedium),
                          const SizedBox(height: 4),
                          Text(plan.monthlyRupees == 0 ? 'Free' : '₹${plan.monthlyRupees} a month, GST extra', style: text.bodyLarge),
                          const SizedBox(height: 4),
                          Text(planLimits(plan), style: text.bodyMedium),
                          const SizedBox(height: 8),
                          for (final feature in plan.features) Text('• ${featureWords[feature] ?? feature}', style: text.bodyMedium),
                          if (owner && buyInApp && plan.buyable && plan.id != e.plan && !e.paying) ...[
                            const SizedBox(height: 12),
                            FilledButton(onPressed: _busy ? null : () => _subscribe(plan), child: Text('Choose ${plan.title}')),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
                if (owner && e.paying && e.status != 'cancelled') ...[
                  const SizedBox(height: 16),
                  OutlinedButton(onPressed: _busy ? null : _cancel, child: const Text('Cancel plan')),
                ],
                if (!owner) ...[
                  const SizedBox(height: 16),
                  Text('Only the owner can change the plan.', style: text.bodyMedium),
                ],
                if (owner && !buyInApp) ...[
                  const SizedBox(height: 16),
                  Text('Plans are managed from your MyCA account outside this app.', style: text.bodyMedium),
                ],
              ],
            ),
    );
  }
}
