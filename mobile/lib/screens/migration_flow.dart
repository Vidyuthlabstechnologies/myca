import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../migration.dart';
import '../proposal_flow.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'books_check_screen.dart';

class MigrationFlow extends StatefulWidget {
  const MigrationFlow({
    super.key,
    required this.snapshot,
    this.bringMore = false,
  });

  final Snapshot snapshot;
  final bool bringMore;

  @override
  State<MigrationFlow> createState() => _MigrationFlowState();
}

class _MigrationFlowState extends State<MigrationFlow> {
  int _step = 0;
  MigrationPath? _path;

  bool get _skipsBusiness =>
      widget.bringMore || AppScope.of(context).cloud != null;

  void _choose(MigrationPath path) => setState(() {
    _path = path;
    _step = _skipsBusiness ? 2 : 1;
  });

  void _back() {
    if (_step == 0) return Navigator.of(context).pop();
    setState(() => _step = _skipsBusiness ? 0 : _step - 1);
  }

  Future<void> _finish() async {
    final state = AppScope.of(context);
    if (!widget.bringMore) return state.finishMigration();
    final navigator = Navigator.of(context);
    await state.refresh();
    navigator.pop();
    navigator.push(
      MaterialPageRoute<void>(builder: (_) => const BooksCheckScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final path = _path;
    return Scaffold(
      appBar: AppBar(
        leading: _step == 0 && !widget.bringMore
            ? null
            : BackButton(onPressed: _back),
        automaticallyImplyLeading: false,
        title: widget.bringMore
            ? const Text('Bring in more books')
            : _StepDots(step: _step),
      ),
      body: SafeArea(
        child: switch (_step) {
          0 => _SourceStep(onChoose: _choose, bringMore: widget.bringMore),
          1 => _BusinessStep(
            company: widget.snapshot.company,
            onDone: () => setState(() => _step = 2),
          ),
          _ => _ImportStep(
            path: path!,
            bringMore: widget.bringMore,
            onFinish: _finish,
          ),
        },
      ),
    );
  }
}

class _StepDots extends StatelessWidget {
  const _StepDots({required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 3; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            margin: const EdgeInsets.only(right: 6),
            width: i == step ? 22 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i <= step ? Palette.ink : Palette.line,
              borderRadius: BorderRadius.circular(10),
            ),
          ),
      ],
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: text.headlineMedium),
          const SizedBox(height: 6),
          Text(subtitle, style: text.bodyLarge?.copyWith(color: Palette.muted)),
        ],
      ),
    );
  }
}

class _SourceStep extends StatelessWidget {
  const _SourceStep({required this.onChoose, required this.bringMore});

  final ValueChanged<MigrationPath> onChoose;
  final bool bringMore;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _StepHeader(
          title: bringMore
              ? 'Where is it coming from?'
              : 'Where are your books today?',
          subtitle: bringMore
              ? 'Everything is previewed before it is added, and rows already in your books are skipped.'
              : 'Pick the closest one. You can bring more in later.',
        ),
        Panel(
          children: [
            for (final path in migrationPaths.where(
              (path) => !bringMore || path.imports.isNotEmpty,
            ))
              RowCard(
                leading: TintTile(tint: path.tint, mark: path.mark),
                title: path.title,
                subtitle: path.subtitle,
                trailing: const Chevron(),
                onTap: () => onChoose(path),
              ),
          ],
        ),
      ],
    );
  }
}

class _BusinessStep extends StatefulWidget {
  const _BusinessStep({required this.company, required this.onDone});

  final Company company;
  final VoidCallback onDone;

  @override
  State<_BusinessStep> createState() => _BusinessStepState();
}

class _BusinessStepState extends State<_BusinessStep> {
  late final _name = TextEditingController(text: widget.company.name);
  late final _gstin = TextEditingController(text: widget.company.gstin);
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _gstin.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final gstin = _gstin.text.trim().toUpperCase();
    final shape = gstinShapeError(gstin);
    if (name.isEmpty) {
      return setState(() => _error = 'Enter your business name.');
    }
    if (shape != null) return setState(() => _error = shape);
    final unchanged =
        name == widget.company.name && gstin == widget.company.gstin;
    if (unchanged) return widget.onDone();
    final api = AppScope.of(context).api;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final outcome = await api.updateCompany(name: name, gstin: gstin);
      if (!mounted) return;
      if (outcome.ok) return widget.onDone();
      setState(
        () => _error =
            'MyCA did not accept that (${outcome.error}). Check the GSTIN.',
      );
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const _StepHeader(
          title: 'Tell us about the business',
          subtitle: 'This goes on your invoices and returns.',
        ),
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Business name'),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _gstin,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: 'GSTIN',
            helperText: 'Leave empty if you are not registered for GST',
          ),
        ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            _error,
            style: TextStyle(
              color: Palette.danger,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Saving…' : 'Continue'),
        ),
      ],
    );
  }
}

class _ImportStep extends StatefulWidget {
  const _ImportStep({
    required this.path,
    required this.bringMore,
    required this.onFinish,
  });

  final MigrationPath path;
  final bool bringMore;
  final Future<void> Function() onFinish;

  @override
  State<_ImportStep> createState() => _ImportStepState();
}

class _ImportStepState extends State<_ImportStep> with ProposalFlow {
  final _scroll = ScrollController();
  bool _brought = false;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async => setState(() => _brought = true);

  @override
  void onThreadChanged() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _pick(ImportOption option) async {
    final picked = await AppScope.of(context).pickTextFile(option.extensions);
    if (picked == null || !mounted) return;
    final api = AppScope.of(context).api;
    final String documentSha256;
    try {
      documentSha256 = await api.upload(picked.name, picked.content);
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(
          () => entries.add(
            ThreadEntry(text: err.message, tone: BubbleTone.problem),
          ),
        );
        onThreadChanged();
      }
      return;
    }
    if (!mounted) return;
    await propose(picked.name, option.tool, option.argsFor(documentSha256));
  }

  @override
  Widget build(BuildContext context) {
    final path = widget.path;
    final options = path.imports;
    final finishLabel = widget.bringMore
        ? 'Done'
        : (_brought || options.isEmpty ? 'Open my books' : 'Skip for now');
    return Column(
      children: [
        Expanded(
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            children: [
              _StepHeader(
                title: options.isEmpty
                    ? 'You are all set'
                    : 'Bring your books across',
                subtitle: path.promise,
              ),
              if (options.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Panel(
                    children: [
                      for (final option in options)
                        RowCard(
                          leading: TintTile(
                            tint: path.tint,
                            mark: Mark.bringIn,
                          ),
                          title: option.title,
                          subtitle: option.howTo,
                          trailing: const Chevron(),
                          onTap: busy ? null : () => _pick(option),
                        ),
                    ],
                  ),
                ),
              for (final entry in entries) entry.toBubble(),
            ],
          ),
        ),
        if (pending != null)
          ProposalBar(
            busy: busy,
            onPost: postPending,
            onDiscard: discardPending,
            postLabel: 'Bring it in',
          )
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : widget.onFinish,
                child: Text(finishLabel),
              ),
            ),
          ),
      ],
    );
  }
}
