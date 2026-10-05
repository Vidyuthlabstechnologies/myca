import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'party_picker.dart';
import 'party_screen.dart';

const _searchFrom = 6;

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.kind});

  final RegisterKind kind;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _query = TextEditingController();

  bool get _sales => widget.kind == RegisterKind.sales;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _openParty(String name, String gstin, {bool openComposer = false}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PartyScreen(
          kind: widget.kind,
          partyName: name,
          partyGstin: gstin,
          openComposer: openComposer,
        ),
      ),
    );
  }

  Future<void> _newParty() async {
    final created = await showNewPartySheet(context, widget.kind);
    if (created == null || !mounted) return;
    _openParty(created.name, created.gstin, openComposer: true);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final snapshot = state.snapshot;
    final documents = snapshot == null
        ? const <Invoice>[]
        : (_sales ? snapshot.invoices : snapshot.purchases);
    final all = partiesOf(documents);
    final parties = searchParties(all, _query.text);
    final tint = _sales ? Tint.sales : Tint.purchases;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(_sales ? 'Sales' : 'Purchases')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newParty,
        icon: const Icon(Icons.add),
        label: Text(_sales ? 'New customer' : 'New supplier'),
      ),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
          children: [
            if (all.length >= _searchFrom)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _query,
                  decoration: InputDecoration(
                    hintText: _sales ? 'Search customers' : 'Search suppliers',
                    prefixIcon: const Icon(Icons.search),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            if (all.isEmpty)
              EmptyNote(
                text: _sales
                    ? 'No customers yet. Add one to record your first sale.'
                    : 'No suppliers yet. Add one to record your first bill.',
              )
            else if (parties.isEmpty)
              const EmptyNote(text: 'No one by that name.'),
            if (parties.isNotEmpty)
              Panel(
                children: [
                  for (final party in parties)
                    RowCard(
                      leading: TintTile(tint: tint, letter: party.initial),
                      title: party.name,
                      subtitle: lastEntryLine(party.latest!, widget.kind),
                      trailing: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            party.latest!.date,
                            style: text.bodySmall?.copyWith(
                              color: Palette.muted,
                            ),
                          ),
                          if (_sales && party.unpaid.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            StatusTag(
                              text: '${party.unpaid.length} unpaid',
                              color: Palette.warn,
                            ),
                          ],
                        ],
                      ),
                      onTap: () => _openParty(party.name, party.gstin),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
