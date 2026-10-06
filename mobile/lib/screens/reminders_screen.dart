import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class ReminderDraft {
  const ReminderDraft({required this.text, required this.due});

  final String text;
  final String due;
}

String reminderWhen(Reminder reminder) => switch (reminder.state) {
  'overdue' =>
    reminder.inDays == -1 ? 'Yesterday' : '${-reminder.inDays} days ago',
  'today' => 'Today',
  _ => reminder.inDays == 1 ? 'Tomorrow' : longDate(reminder.due),
};

Future<ReminderDraft?> showReminderSheet(
  BuildContext context, {
  String text = '',
}) {
  return showModalBottomSheet<ReminderDraft>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => _ReminderSheet(text: text),
  );
}

class _ReminderSheet extends StatefulWidget {
  const _ReminderSheet({required this.text});

  final String text;

  @override
  State<_ReminderSheet> createState() => _ReminderSheetState();
}

class _ReminderSheetState extends State<_ReminderSheet> {
  late final _text = TextEditingController(text: widget.text);
  DateTime? _due;
  String _error = '';

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  DateTime get _today {
    final now = AppScope.of(context).now();
    return DateTime(now.year, now.month, now.day);
  }

  Future<void> _pick() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _due ?? _today.add(const Duration(days: 1)),
      firstDate: _today,
      lastDate: _today.add(const Duration(days: 730)),
    );
    if (picked != null) setState(() => _due = picked);
  }

  void _done() {
    final text = _text.text.trim();
    if (text.isEmpty) {
      return setState(() => _error = 'Say what to remind you about.');
    }
    final due = _due;
    if (due == null) return setState(() => _error = 'Choose a day.');
    Navigator.of(context).pop(ReminderDraft(text: text, due: isoDate(due)));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = _today;
    final choices = {
      'Today': today,
      'Tomorrow': today.add(const Duration(days: 1)),
      'In a week': today.add(const Duration(days: 7)),
    };
    final picked = _due;
    final custom = picked != null && !choices.values.contains(picked);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Remind me', style: text.headlineSmall),
          const SizedBox(height: 14),
          TextField(
            controller: _text,
            autofocus: widget.text.isEmpty,
            textCapitalization: TextCapitalization.sentences,
            maxLength: 200,
            decoration: const InputDecoration(
              labelText: 'What about',
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in choices.entries)
                ChoiceChip(
                  label: Text(entry.key),
                  selected: picked == entry.value,
                  selectedColor: Palette.sunken,
                  showCheckmark: false,
                  onSelected: (_) => setState(() => _due = entry.value),
                ),
              ChoiceChip(
                label: Text(custom ? longDate(isoDate(picked)) : 'Pick a day'),
                selected: custom,
                selectedColor: Palette.sunken,
                showCheckmark: false,
                onSelected: (_) => _pick(),
              ),
            ],
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _error,
              style: const TextStyle(
                color: Palette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _done, child: const Text('Preview')),
          ),
        ],
      ),
    );
  }
}

Future<bool> confirmReminderDone(
  BuildContext context,
  Reminder reminder,
) async {
  final api = AppScope.of(context).api;
  final yes = await showModalBottomSheet<bool>(
    context: context,
    builder: (sheet) {
      final text = Theme.of(sheet).textTheme;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 4, 22, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                reminderWhen(reminder).toUpperCase(),
                style: text.labelSmall,
              ),
              const SizedBox(height: 4),
              Text(reminder.text, style: text.headlineSmall),
              if (reminder.aboutLabel.isNotEmpty)
                Text(reminder.aboutLabel, style: text.bodyMedium),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(sheet).pop(true),
                  child: const Text('Mark done'),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
  if (yes != true) return false;
  try {
    final held = await api.propose('complete_reminder', {'id': reminder.id});
    final preview = held.preview;
    if (preview == null) return false;
    return (await api.confirm(preview.token)).posted;
  } on MycaApiException {
    return false;
  }
}

class RemindersScreen extends StatefulWidget {
  const RemindersScreen({super.key});

  @override
  State<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends State<RemindersScreen> with ProposalFlow {
  Future<List<Reminder>>? _reminders;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    _reload();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reminders ??= _load();
  }

  Future<List<Reminder>> _load() async =>
      remindersFrom(await api.query('list_reminders'));

  void _reload() {
    final next = _load();
    setState(() {
      _reminders = next;
    });
  }

  Future<void> _add() async {
    final draft = await showReminderSheet(context);
    if (draft == null || !mounted) return;
    await propose('Remind me: ${draft.text}', 'add_reminder', {
      'text': draft.text,
      'due': draft.due,
    });
  }

  Future<void> _done(Reminder reminder) async {
    if (await confirmReminderDone(context, reminder) && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reminders')),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<List<Reminder>>(
              future: _reminders,
              builder: (context, state) {
                final reminders = state.data ?? const <Reminder>[];
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  children: [
                    if (state.connectionState == ConnectionState.done &&
                        reminders.isEmpty &&
                        entries.isEmpty)
                      const EmptyNote(
                        text:
                            'No reminders. Add one here, or say "remind me to call Rajesh tomorrow" in Ask.',
                      ),
                    if (reminders.isNotEmpty)
                      Panel(
                        children: [
                          for (final reminder in reminders)
                            RowCard(
                              leading: TintTile(
                                tint: reminder.state == 'overdue'
                                    ? Tint.urgent
                                    : (reminder.state == 'today'
                                          ? Tint.taxes
                                          : Tint.ask),
                                mark: reminder.state == 'later'
                                    ? Mark.comingUp
                                    : Mark.dueSoon,
                              ),
                              title: reminder.text,
                              subtitle: [
                                reminderWhen(reminder),
                                if (reminder.aboutLabel.isNotEmpty)
                                  reminder.aboutLabel,
                              ].join(' · '),
                              onTap: busy ? null : () => _done(reminder),
                            ),
                        ],
                      ),
                    const SizedBox(height: 12),
                    for (final entry in entries) entry.toBubble(),
                  ],
                );
              },
            ),
          ),
          if (pending != null)
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
            )
          else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: ActionChip(
                    avatar: const Icon(Icons.add, size: 18),
                    label: const Text('Reminder'),
                    onPressed: busy ? null : _add,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
