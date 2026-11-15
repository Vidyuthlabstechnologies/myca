import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../my/my_strings.dart';
import '../theme.dart';

class PrivacyNoticeScreen extends StatefulWidget {
  const PrivacyNoticeScreen({super.key, this.readOnly = false});

  final bool readOnly;

  @override
  State<PrivacyNoticeScreen> createState() => _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends State<PrivacyNoticeScreen> {
  Future<PrivacyNotice>? _notice;
  String _error = '';
  bool _busy = false;
  bool _crashReports = false;
  bool _adult = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _notice ??= AppScope.of(context).cloud!.privacyNotice(region: AppScope.of(context).edition);
  }

  Future<void> _agree(PrivacyNotice notice) async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await state.cloud!.acceptNotice(notice, adult: _adult);
      if (_crashReports) await state.setCrashReports(true);
      await state.refresh();
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _error = err.message;
          _notice = state.cloud!.privacyNotice(region: state.edition);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _retry() {
    setState(() {
      _notice = AppScope.of(context).cloud!.privacyNotice(region: AppScope.of(context).edition);
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final malaysia = state.edition == 'MY';
    String w(String english, String malay) => myMalayOr(context, english, malay);
    return Scaffold(
      appBar: widget.readOnly ? AppBar(title: Text(w('Privacy notice', 'Notis privasi'))) : null,
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
                            : w('The privacy notice could not be loaded.', 'Notis privasi tidak dapat dimuatkan.'),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _retry,
                        child: Text(w('Try again', 'Cuba lagi')),
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
            final us = state.edition == 'US';
            final body = [
              Text(notice.title, style: text.headlineMedium),
              if (notice.status.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  notice.status,
                  style: text.bodyMedium?.copyWith(color: paletteOf(context).warn),
                ),
              ],
              for (final section in notice.sections) ...[
                const SizedBox(height: 20),
                Semantics(header: true, child: Text(section.heading, style: text.titleMedium)),
                const SizedBox(height: 6),
                Text(section.body, style: text.bodyLarge),
              ],
            ];
            final consent = [
              if (_error.isNotEmpty) ...[
                Text(
                  _error,
                  style: TextStyle(color: paletteOf(context).danger),
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
                  title: Text(w('Also send crash reports', 'Hantar juga laporan ranap')),
                  subtitle: Text(
                    malaysia
                        ? w(
                            'Off unless you tick it. Only what went wrong in the app, with names, amounts, TINs, MyKad numbers and phone numbers removed.',
                            'Dimatikan melainkan anda menandakannya. Hanya perkara yang tidak kena dalam aplikasi, dengan nama, amaun, TIN, nombor MyKad dan nombor telefon dibuang.',
                          )
                        : us
                        ? 'Off unless you check it. Only what went wrong in the app, with names, amounts, Social Security numbers and phone numbers removed. You can change this later under Your account.'
                        : state.edition == 'GB'
                        ? 'Off unless you tick it. Only what went wrong in the app, with names, amounts, tax references and phone numbers removed. You can change this later under Your business.'
                        : 'Off unless you tick it. Only what went wrong in the app, with names, amounts, GSTINs and phone numbers removed. You can change this later under Your business.',
                  ),
                ),
              ),
              if (notice.requiresAdult)
                Material(
                  color: Colors.transparent,
                  child: CheckboxListTile(
                    key: const ValueKey('consent.adult'),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: _adult,
                    onChanged: _busy ? null : (value) => setState(() => _adult = value ?? false),
                    title: Text(w('I am 18 or over', 'Saya berumur 18 tahun atau lebih')),
                  ),
                ),
              const SizedBox(height: 4),
              FilledButton(
                key: const ValueKey('consent.agree'),
                onPressed: _busy || (notice.requiresAdult && !_adult) ? null : () => _agree(notice),
                child: Text(_busy ? w('Saving…', 'Menyimpan…') : w('I agree', 'Saya bersetuju')),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _busy ? null : state.signOut,
                child: Text(w('Not now, sign me out', 'Bukan sekarang, log keluar')),
              ),
            ];
            return LayoutBuilder(
              builder: (context, box) {
                final roomy = box.maxHeight >= 440 && MediaQuery.textScalerOf(context).scale(10) <= 13;
                if (widget.readOnly) {
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                    children: body,
                  );
                }
                if (!roomy) {
                  return ListView(
                    key: const ValueKey('consent.list'),
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                    children: [...body, const SizedBox(height: 20), const Divider(), const SizedBox(height: 8), ...consent],
                  );
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
                        children: body,
                      ),
                    ),
                    Container(
                      constraints: BoxConstraints(maxHeight: box.maxHeight * 0.6),
                      decoration: malaysia
                          ? BoxDecoration(
                              color: Theme.of(context).colorScheme.surface,
                              border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
                            )
                          : BoxDecoration(
                              color: paletteOf(context).surface,
                              border: Border(top: BorderSide(color: paletteOf(context).line)),
                            ),
                      padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: consent,
                        ),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}
