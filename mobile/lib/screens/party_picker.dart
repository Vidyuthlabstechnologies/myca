import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../migration.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'party_screen.dart';

typedef PickedParty = ({String name, String gstin});

Future<void> startEntry(BuildContext context, RegisterKind kind) async {
  final navigator = Navigator.of(context);
  final picked = await showPartyPicker(context, kind);
  if (picked == null) return;
  navigator.push(
    MaterialPageRoute<void>(
      builder: (_) => PartyScreen(
        kind: kind,
        partyName: picked.name,
        partyGstin: picked.gstin,
        openComposer: true,
      ),
    ),
  );
}

Future<PickedParty?> showPartyPicker(BuildContext context, RegisterKind kind) {
  return showModalBottomSheet<PickedParty>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _PartyPicker(kind: kind),
  );
}

Future<PickedParty?> showNewPartySheet(
  BuildContext context,
  RegisterKind kind, {
  String initialName = '',
}) {
  return showModalBottomSheet<PickedParty>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _NewPartySheet(kind: kind, initialName: initialName),
  );
}

String _one(RegisterKind kind) =>
    kind == RegisterKind.sales ? 'customer' : 'supplier';

class _PartyPicker extends StatefulWidget {
  const _PartyPicker({required this.kind});

  final RegisterKind kind;

  @override
  State<_PartyPicker> createState() => _PartyPickerState();
}

class _PartyPickerState extends State<_PartyPicker> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _addNew(String name) async {
    final navigator = Navigator.of(context);
    final created = await showNewPartySheet(
      context,
      widget.kind,
      initialName: name,
    );
    if (created != null) navigator.pop(created);
  }

  @override
  Widget build(BuildContext context) {
    final sales = widget.kind == RegisterKind.sales;
    final snapshot = AppScope.of(context).snapshot;
    final documents = snapshot == null
        ? const <Invoice>[]
        : (sales ? snapshot.invoices : snapshot.purchases);
    final all = partiesOf(documents);
    final typed = _query.text.trim();
    final matches = searchParties(all, typed);
    final offerNew = typed.isNotEmpty && !hasPartyNamed(all, typed);
    final tint = sales ? Tint.sales : Tint.purchases;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              sales ? 'Who did you sell to?' : 'Who did you buy from?',
              style: text.headlineSmall,
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _query,
              autofocus: all.isEmpty,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                hintText: all.isEmpty
                    ? 'Type the ${_one(widget.kind)} name'
                    : 'Search or type a new name',
                prefixIcon: const Icon(Icons.search),
              ),
              onChanged: (_) => setState(() {}),
              onSubmitted: (value) {
                if (offerNew) _addNew(value.trim());
              },
            ),
            const SizedBox(height: 10),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (offerNew)
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                      leading: const CircleAvatar(
                        radius: 21,
                        backgroundColor: Palette.ink,
                        child: Icon(Icons.add, color: Colors.white, size: 20),
                      ),
                      title: Text('Add “$typed”', style: text.titleMedium),
                      subtitle: Text('New ${_one(widget.kind)}'),
                      onTap: () => _addNew(typed),
                    ),
                  for (final party in matches)
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                      leading: TintTile(
                        tint: tint,
                        letter: party.initial,
                        size: 42,
                      ),
                      title: Text(party.name, style: text.titleMedium),
                      subtitle: Text(lastEntryLine(party.latest!, widget.kind)),
                      onTap: () => Navigator.of(
                        context,
                      ).pop((name: party.name, gstin: party.gstin)),
                    ),
                  if (matches.isEmpty && !offerNew)
                    EmptyNote(
                      text:
                          'No ${_one(widget.kind)}s yet. Type a name to add the first one.',
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewPartySheet extends StatefulWidget {
  const _NewPartySheet({required this.kind, required this.initialName});

  final RegisterKind kind;
  final String initialName;

  @override
  State<_NewPartySheet> createState() => _NewPartySheetState();
}

class _NewPartySheetState extends State<_NewPartySheet> {
  late final _name = TextEditingController(text: widget.initialName);
  final _gstin = TextEditingController();
  String _error = '';

  @override
  void dispose() {
    _name.dispose();
    _gstin.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    final gstin = _gstin.text.trim().toUpperCase();
    final shape = gstinShapeError(gstin);
    if (name.isEmpty) return setState(() => _error = 'Enter a name.');
    if (shape != null) return setState(() => _error = shape);
    Navigator.of(context).pop((name: name, gstin: gstin));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('New ${_one(widget.kind)}', style: text.headlineSmall),
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              autofocus: widget.initialName.isEmpty,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _gstin,
              autofocus: widget.initialName.isNotEmpty,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'GSTIN (optional)',
                helperText:
                    'Leave empty for a customer without GST registration',
              ),
              onSubmitted: (_) => _submit(),
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
            const SizedBox(height: 18),
            FilledButton(onPressed: _submit, child: const Text('Continue')),
          ],
        ),
      ),
    );
  }
}
