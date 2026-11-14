import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../cloud/cloud_session.dart';
import '../../my/my_codes.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import '../invitation_cards.dart';
import 'my_widgets.dart';

class MyProfileForm extends StatefulWidget {
  const MyProfileForm({super.key, this.initial, required this.submitLabel, this.beforeSave, required this.onSaved, this.header = const []});

  final MyParty? initial;
  final String submitLabel;
  final Future<void> Function(MyParty party)? beforeSave;
  final Future<void> Function(MyParty party) onSaved;
  final List<Widget> header;

  @override
  State<MyProfileForm> createState() => _MyProfileFormState();
}

class _MyProfileFormState extends State<MyProfileForm> {
  late final _name = TextEditingController(text: widget.initial?.name ?? '');
  late final _tin = TextEditingController(text: widget.initial?.tin ?? '');
  late final _idValue = TextEditingController(text: widget.initial?.idValue ?? '');
  late final _sst = TextEditingController(text: widget.initial?.sst ?? '');
  late final _line = TextEditingController(text: (widget.initial?.address.lines ?? const []).join(', '));
  late final _postcode = TextEditingController(text: widget.initial?.address.postcode ?? '');
  late final _city = TextEditingController(text: widget.initial?.address.city ?? '');
  late final _phone = TextEditingController(text: (widget.initial?.phone ?? '').isEmpty ? '+60' : widget.initial!.phone);
  late final _email = TextEditingController(text: widget.initial?.email ?? '');
  late String _idType = widget.initial?.idType ?? 'BRN';
  late String? _state = (widget.initial?.address.state ?? '').isEmpty ? null : widget.initial!.address.state;
  late String _msic = widget.initial?.msic ?? '';
  String _msicName = '';
  Map<String, String> _errors = const {};
  List<MyProblem> _problems = const [];
  String _error = '';
  String _note = '';
  bool _busy = false;
  String _busyLabel = '';

  @override
  void initState() {
    super.initState();
    if (_msic.isNotEmpty) {
      loadMsicCodes().then((codes) {
        final found = codes.where((code) => code.code == _msic);
        if (mounted && found.isNotEmpty) setState(() => _msicName = found.first.name);
      }).catchError((Object _) {});
    }
  }

  @override
  void dispose() {
    for (final controller in [_name, _tin, _idValue, _sst, _line, _postcode, _city, _phone, _email]) {
      controller.dispose();
    }
    super.dispose();
  }

  MyParty get _party => MyParty(
    name: _name.text,
    tin: _tin.text,
    idType: _idType,
    idValue: _idValue.text,
    sst: _sst.text,
    msic: _msic,
    phone: _phone.text,
    email: _email.text,
    address: MyAddress(lines: [_line.text], postcode: _postcode.text, city: _city.text, state: _state ?? ''),
  );

  Map<String, String> _validate(MyStrings t) {
    final errors = <String, String>{};
    if (_name.text.trim().isEmpty) errors['name'] = t.companyNameMissing;
    if (!isMyTinShape(_tin.text)) errors['tin'] = t.tinBad;
    if (_idValue.text.trim().isEmpty) {
      errors['idValue'] = t.idValueMissing;
    } else if (_idType == 'BRN' && !isMyBrnShape(_idValue.text)) {
      errors['idValue'] = t.brnBad;
    } else if (_idType == 'NRIC' && !isMyNricShape(_idValue.text)) {
      errors['idValue'] = t.nricBad;
    }
    if (_sst.text.trim().isNotEmpty && !isMySstShape(_sst.text)) errors['sst'] = t.sstBad;
    if (!isMyMsicShape(_msic)) errors['msic'] = t.msicMissing;
    if (_line.text.trim().isEmpty) errors['line'] = t.addressMissing;
    if (_postcode.text.trim().isNotEmpty && !isMyPostcodeShape(_postcode.text)) errors['postcode'] = t.postcodeBad;
    if (_city.text.trim().isEmpty) errors['city'] = t.cityMissing;
    if (_state == null) errors['state'] = t.stateMissing;
    if (!isMyPhoneShape(_phone.text)) errors['phone'] = t.phoneBad;
    if (_email.text.trim().isNotEmpty && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim())) errors['email'] = t.emailBad;
    return errors;
  }

  Future<void> _submit() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final errors = _validate(t);
    setState(() {
      _errors = errors;
      _problems = const [];
      _error = '';
      _note = '';
    });
    if (errors.isNotEmpty) return;
    final state = AppScope.of(context);
    final party = _party;
    setState(() {
      _busy = true;
      _busyLabel = t.checkingTin;
    });
    try {
      await widget.beforeSave?.call(party);
      final tools = MyTools(state.api);
      final check = await tools.validateTin(tin: party.tin, idType: party.idType, idValue: party.idValue);
      if (!check.format) {
        if (mounted) setState(() => _errors = {'tin': t.tinBad});
        return;
      }
      if (check.lhdn == 'not found') {
        if (mounted) setState(() => _error = t.tinNotFound);
        return;
      }
      if (mounted) {
        setState(() {
          _note = check.lhdn == 'valid' ? t.tinValid : '';
          _busyLabel = t.saving;
        });
      }
      await tools.saveProfile(party);
      await widget.onSaved(party);
    } on MyToolFailure catch (failure) {
      if (mounted) {
        setState(() {
          _problems = failure.problems;
          _error = t.errorText(failure.code);
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = myErrorMessage(t, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickMsic() async {
    final picked = await Navigator.of(context).push<MsicCode>(MaterialPageRoute(builder: (_) => const MsicPickerScreen()));
    if (picked == null || !mounted) return;
    setState(() {
      _msic = picked.code;
      _msicName = picked.name;
      _errors = {..._errors}..remove('msic');
    });
  }

  Widget _field(String key, TextEditingController controller, String label, {String? helper, TextInputType? keyboard, TextCapitalization caps = TextCapitalization.none, List<String>? autofill, int maxLength = 0}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        key: Key('myProfile.$key'),
        controller: controller,
        keyboardType: keyboard,
        textCapitalization: caps,
        autofillHints: autofill,
        maxLength: maxLength > 0 ? maxLength : null,
        decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 3, errorText: _errors[key], errorMaxLines: 3, counterText: ''),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      children: [
        ...widget.header,
        _field('name', _name, t.companyName, helper: t.companyNameHelp, caps: TextCapitalization.words, autofill: const [AutofillHints.organizationName], maxLength: 300),
        _field('tin', _tin, t.tin, helper: t.tinHelp, caps: TextCapitalization.characters, maxLength: 14),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: MyPicker<String>(
            key: const Key('myProfile.idType'),
            label: t.idType,
            value: _idType,
            items: [for (final code in const ['BRN', 'NRIC']) (code, t.idTypeName(code))],
            onChanged: (value) => setState(() => _idType = value ?? 'BRN'),
          ),
        ),
        _field('idValue', _idValue, t.idValue, helper: _idType == 'BRN' ? t.brnHelp : null, keyboard: TextInputType.text, caps: TextCapitalization.characters, maxLength: 20),
        _field('sst', _sst, t.sst, helper: t.sstHelp, caps: TextCapitalization.characters, maxLength: 40),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: InkWell(
            key: const Key('myProfile.msic'),
            onTap: _pickMsic,
            borderRadius: BorderRadius.circular(10),
            child: InputDecorator(
              decoration: InputDecoration(labelText: t.msic, errorText: _errors['msic'], errorMaxLines: 3, suffixIcon: const Icon(Icons.search)),
              isEmpty: _msic.isEmpty,
              child: Text(_msic.isEmpty ? '' : (_msicName.isEmpty ? _msic : '$_msic · $_msicName'), maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
          ),
        ),
        MySection(t.address),
        _field('line', _line, t.addressLine, caps: TextCapitalization.words, autofill: const [AutofillHints.streetAddressLine1], maxLength: 150),
        _field('postcode', _postcode, t.postcode, keyboard: TextInputType.number, autofill: const [AutofillHints.postalCode], maxLength: 5),
        _field('city', _city, t.city, caps: TextCapitalization.words, autofill: const [AutofillHints.addressCity], maxLength: 50),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: MyPicker<String>(
            key: const Key('myProfile.state'),
            label: t.state,
            value: _state,
            error: _errors['state'],
            items: [for (final (code, name) in myStates) (code, name)],
            onChanged: (value) => setState(() {
              _state = value;
              _errors = {..._errors}..remove('state');
            }),
          ),
        ),
        _field('phone', _phone, t.phone, helper: t.phoneHelp, keyboard: TextInputType.phone, autofill: const [AutofillHints.telephoneNumber], maxLength: 20),
        _field('email', _email, '${t.email} (${t.optional.toLowerCase()})', keyboard: TextInputType.emailAddress, autofill: const [AutofillHints.email], maxLength: 320),
        if (_note.isNotEmpty) ...[MyNote(_note, tone: MyTone.good), const SizedBox(height: 12)],
        if (_problems.isNotEmpty) ...[MyProblems(title: _error, problems: _problems), const SizedBox(height: 12)] else if (_error.isNotEmpty) ...[MyErrorBox(message: _error), const SizedBox(height: 12)],
        const SizedBox(height: 8),
        MyBusyButton(key: const Key('myProfile.save'), label: widget.submitLabel, busyLabel: _busyLabel, busy: _busy, onPressed: _submit),
        const SizedBox(height: 16),
        Text(t.setupFoot, style: text.bodySmall?.copyWith(color: palette.muted)),
      ],
    );
  }
}

class MsicPickerScreen extends StatefulWidget {
  const MsicPickerScreen({super.key});

  @override
  State<MsicPickerScreen> createState() => _MsicPickerScreenState();
}

class _MsicPickerScreenState extends State<MsicPickerScreen> {
  late Future<List<MsicCode>> _codes = loadMsicCodes();
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.msicPick)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              key: const Key('msic.search'),
              autofocus: true,
              decoration: InputDecoration(prefixIcon: const Icon(Icons.search), labelText: t.msicSearch),
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<MsicCode>>(
              future: _codes,
              builder: (context, loaded) {
                if (loaded.hasError) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: MyErrorBox(message: t.msicLoadFailed, onRetry: () => setState(() => _codes = loadMsicCodes())),
                  );
                }
                final codes = loaded.data;
                if (codes == null) return const Center(child: CircularProgressIndicator());
                final found = searchMsic(codes, _query);
                if (found.isEmpty) return Padding(padding: const EdgeInsets.all(24), child: Text(t.msicNone, textAlign: TextAlign.center));
                return ListView.builder(
                  itemCount: found.length,
                  itemBuilder: (context, index) {
                    final code = found[index];
                    return ListTile(
                      key: Key('msic.${code.code}'),
                      title: Text(code.name),
                      subtitle: Text(code.code),
                      onTap: () => Navigator.of(context).pop(code),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class MySetupScreen extends StatefulWidget {
  const MySetupScreen({super.key});

  @override
  State<MySetupScreen> createState() => _MySetupScreenState();
}

class _MySetupScreenState extends State<MySetupScreen> {
  Future<Me>? _me;
  bool _created = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _me ??= AppScope.of(context).cloud!.me();
  }

  Future<void> _answered({required bool joined}) async {
    final state = AppScope.of(context);
    if (joined) return state.refresh();
    setState(() => _me = state.cloud!.me());
  }

  Future<void> _create(MyParty party) async {
    if (_created) return;
    await AppScope.of(context).cloud!.createBusiness(name: party.name.trim(), country: 'MY');
    _created = true;
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        actions: [
          const MyLanguageButton(),
          TextButton(onPressed: state.signOut, child: Text(t.signOut)),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: MyProfileForm(
          submitLabel: t.continueLabel,
          beforeSave: _create,
          onSaved: (_) => state.refresh(),
          header: [
            FutureBuilder<Me>(
              future: _me,
              builder: (context, loaded) {
                final invitations = loaded.data?.invitations ?? const <InvitationRef>[];
                if (invitations.isEmpty) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(t.invited, style: text.headlineMedium),
                    const SizedBox(height: 14),
                    InvitationCards(invitations: invitations, onChanged: _answered),
                    const SizedBox(height: 10),
                    const Divider(),
                    const SizedBox(height: 18),
                  ],
                );
              },
            ),
            Text(t.setupTitle, style: text.headlineMedium),
            const SizedBox(height: 6),
            Text(t.setupBody, style: text.bodyLarge?.copyWith(color: context.myca.muted)),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class MyProfileScreen extends StatefulWidget {
  const MyProfileScreen({super.key});

  @override
  State<MyProfileScreen> createState() => _MyProfileScreenState();
}

class _MyProfileScreenState extends State<MyProfileScreen> {
  Future<MyParty?>? _profile;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _profile ??= MyTools(AppScope.of(context).api).profile();
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.profileTitle)),
      body: SafeArea(
        child: FutureBuilder<MyParty?>(
          future: _profile,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            final name = AppScope.of(context).snapshot?.company.name ?? '';
            final initial = loaded.data ?? (name.isEmpty ? null : MyParty(name: name, tin: ''));
            return MyProfileForm(
              initial: initial,
              submitLabel: t.saveDetails,
              onSaved: (_) async {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.profileSaved)));
                Navigator.of(context).pop(true);
              },
            );
          },
        ),
      ),
    );
  }
}
