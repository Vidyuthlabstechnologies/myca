import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';

class PrivacyNoticeScreen extends StatefulWidget {
  const PrivacyNoticeScreen({super.key});

  @override
  State<PrivacyNoticeScreen> createState() => _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends State<PrivacyNoticeScreen> {
  Future<PrivacyNotice>? _notice;
  String _error = '';
  bool _busy = false;
  bool _crashReports = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _notice ??= AppScope.of(context).cloud!.privacyNotice();
  }

  Future<void> _agree(PrivacyNotice notice) async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await state.cloud!.acceptNotice(notice);
      if (_crashReports) await state.setCrashReports(true);
      await state.refresh();
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _error = err.message;
          _notice = state.cloud!.privacyNotice();
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _retry() {
    setState(() {
      _notice = AppScope.of(context).cloud!.privacyNotice();
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    return Scaffold(
      body: SafeArea(
        child: FutureBuilder<PrivacyNotice>(
          future: _notice,
          builder: (context, snap) {
            if (snap.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        snap.error is MycaApiException
                            ? (snap.error! as MycaApiException).message
                            : 'The privacy notice could not be loaded.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _retry,
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
              );
            }
            final notice = snap.data;
            if (notice == null) {
              return const Center(child: CircularProgressIndicator());
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
                    children: [
                      Text(notice.title, style: text.headlineMedium),
                      if (notice.status.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          notice.status,
                          style: text.bodyMedium?.copyWith(color: Palette.warn),
                        ),
                      ],
                      for (final section in notice.sections) ...[
                        const SizedBox(height: 20),
                        Text(section.heading, style: text.titleMedium),
                        const SizedBox(height: 6),
                        Text(section.body, style: text.bodyLarge),
                      ],
                    ],
                  ),
                ),
                Container(
                  decoration: const BoxDecoration(
                    color: Palette.surface,
                    border: Border(top: BorderSide(color: Palette.line)),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_error.isNotEmpty) ...[
                        Text(
                          _error,
                          style: const TextStyle(color: Palette.danger),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Material(
                        color: Colors.transparent,
                        child: CheckboxListTile(
                          key: const ValueKey('consent.crashReports'),
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          value: _crashReports,
                          onChanged: _busy
                              ? null
                              : (value) => setState(
                                  () => _crashReports = value ?? false,
                                ),
                          title: const Text('Also send crash reports'),
                          subtitle: const Text(
                            'Off unless you tick it. Only what went wrong in the app, with names, amounts, GSTINs and phone numbers removed. You can change this later under Your business.',
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      FilledButton(
                        onPressed: _busy ? null : () => _agree(notice),
                        child: Text(_busy ? 'Saving…' : 'I agree'),
                      ),
                      const SizedBox(height: 4),
                      TextButton(
                        onPressed: _busy ? null : state.signOut,
                        child: const Text('Not now, sign me out'),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
