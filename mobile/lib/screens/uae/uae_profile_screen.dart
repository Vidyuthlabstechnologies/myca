import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../proposal_flow.dart';
import '../../theme.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_strings.dart';
import 'uae_widgets.dart';

class UaeProfileScreen extends StatefulWidget {
  const UaeProfileScreen({super.key});

  @override
  State<UaeProfileScreen> createState() => _UaeProfileScreenState();
}

class _UaeProfileScreenState extends State<UaeProfileScreen> with ProposalFlow {
  final _name = TextEditingController();
  final _nameAr = TextEditingController();
  final _trn = TextEditingController();
  final _licence = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _freeZoneName = TextEditingController();
  final _yearEnd = TextEditingController(text: '12-31');
  String? _emirate;
  bool _freeZone = false;
  String _note = '';
  Map<String, dynamic>? _trnCheck;
  bool _started = false;
  Map<String, Object?>? _proposed;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    final saved = _proposed;
    if (saved != null) uaeProfile.value = {...?uaeProfile.value, ...saved};
    if (!mounted) return;
    setState(() => _note = UaeStrings.of(context).saved);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final saved = uaeProfile.value;
    final company = AppScope.of(context).snapshot?.company;
    _name.text = '${saved?['name'] ?? company?.name ?? ''}';
    _nameAr.text = '${saved?['nameAr'] ?? ''}';
    _trn.text = '${saved?['trn'] ?? ''}';
    _licence.text = '${saved?['legalId'] ?? ''}';
    _address.text = '${saved?['addressLine'] ?? ''}';
    _city.text = '${saved?['city'] ?? ''}';
    _freeZoneName.text = '${saved?['freeZoneName'] ?? ''}';
    if (saved?['financialYearEnd'] is String) _yearEnd.text = saved!['financialYearEnd'] as String;
    _emirate = emirateByCode(saved?['emirate'] as String?)?.code;
    _freeZone = saved?['freeZone'] == true;
  }

  @override
  void dispose() {
    for (final c in [_name, _nameAr, _trn, _licence, _address, _city, _freeZoneName, _yearEnd]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _checkTrn() async {
    Map<String, dynamic> data;
    try {
      data = toolData(await api.query('validate_ae_trn', {'trn': _trn.text}));
    } on MycaApiException catch (err) {
      data = {'valid': false, 'why': err.message};
    }
    if (!mounted) return;
    setState(() => _trnCheck = data);
  }

  Map<String, Object?> _args() => {
    'name': _name.text.trim(),
    if (_nameAr.text.trim().isNotEmpty) 'nameAr': _nameAr.text.trim(),
    if (_trn.text.trim().isNotEmpty) 'trn': _trn.text.replaceAll(RegExp(r'[\s-]'), ''),
    if (_licence.text.trim().isNotEmpty) 'legalId': _licence.text.trim(),
    'legalIdType': 'TL',
    'emirate': ?_emirate,
    if (_address.text.trim().isNotEmpty) 'addressLine': _address.text.trim(),
    if (_city.text.trim().isNotEmpty) 'city': _city.text.trim(),
    'freeZone': _freeZone,
    if (_freeZone && _freeZoneName.text.trim().isNotEmpty) 'freeZoneName': _freeZoneName.text.trim(),
    if (_yearEnd.text.trim().isNotEmpty) 'financialYearEnd': _yearEnd.text.trim(),
  };

  Future<void> _preview() async {
    final s = UaeStrings.of(context);
    if (_name.text.trim().isEmpty) return setState(() => _note = s.needName);
    if (_emirate == null) return setState(() => _note = s.needEmirate);
    setState(() => _note = '');
    final args = _args();
    _proposed = args;
    await propose(s.profileTitle, 'set_ae_business_profile', args);
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    final check = _trnCheck;
    Widget field(String key, TextEditingController c, String label, {String? helper, TextDirection? direction, TextInputType? keyboard, int? maxLength}) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: ValueKey(key),
        controller: c,
        textDirection: direction,
        keyboardType: keyboard,
        maxLength: maxLength,
        decoration: InputDecoration(label: Text(label, maxLines: 2), helperText: helper, helperMaxLines: 3, counterText: ''),
      ),
    );
    return Scaffold(
      appBar: AppBar(title: Text(s.profileTitle)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                field('uae.profile.name', _name, s.legalNameEn, direction: TextDirection.ltr),
                field('uae.profile.nameAr', _nameAr, s.legalNameAr, direction: TextDirection.rtl),
                field('uae.profile.trn', _trn, s.trn, helper: s.trnHint, direction: TextDirection.ltr, keyboard: TextInputType.number, maxLength: 19),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: OutlinedButton(key: const ValueKey('uae.profile.checkTrn'), onPressed: _checkTrn, child: Text(s.checkTrn)),
                ),
                if (check != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    key: const ValueKey('uae.profile.trnResult'),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: check['valid'] == true ? Palette.accentSoft : Palette.dangerSoft,
                      borderRadius: BorderRadius.circular(radiusControl),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(check['valid'] == true ? s.trnLooksRight : s.trnWrong, style: text.titleSmall),
                        if (check['valid'] == true) ...[
                          Text('TIN ${check['tin'] ?? ''} · Peppol ${check['endpoint'] ?? ''}', textDirection: TextDirection.ltr, style: text.bodyMedium),
                          for (final w in (check['warnings'] as List? ?? const [])) UaeAutoText('$w', style: text.bodySmall),
                        ] else
                          UaeAutoText('${check['why'] ?? ''}', style: text.bodyMedium),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DropdownButtonFormField<String>(
                    key: const ValueKey('uae.profile.emirate'),
                    initialValue: _emirate,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: s.emirate),
                    items: [for (final e in emirates) DropdownMenuItem(value: e.code, child: Text(e.name(s.ar), overflow: TextOverflow.ellipsis))],
                    onChanged: (code) => setState(() => _emirate = code),
                  ),
                ),
                field('uae.profile.licence', _licence, s.tradeLicence, direction: TextDirection.ltr),
                field('uae.profile.address', _address, s.ar ? 'العنوان' : 'Address'),
                field('uae.profile.city', _city, s.ar ? 'المدينة' : 'City'),
                field('uae.profile.yearEnd', _yearEnd, s.ar ? 'نهاية السنة المالية (شهر-يوم)' : 'Financial year end (MM-DD)', direction: TextDirection.ltr),
                SwitchListTile(
                  key: const ValueKey('uae.profile.freeZone'),
                  contentPadding: EdgeInsets.zero,
                  value: _freeZone,
                  onChanged: (on) => setState(() => _freeZone = on),
                  title: Text(s.freeZone),
                ),
                if (_freeZone) field('uae.profile.freeZoneName', _freeZoneName, s.ar ? 'اسم المنطقة الحرة' : 'Free zone name', helper: s.ar ? 'مثل DMCC أو JAFZA أو IFZA' : 'For example DMCC, JAFZA or IFZA'),
                const SizedBox(height: 8),
                if (pending == null) FilledButton(key: const ValueKey('uae.profile.preview'), onPressed: busy ? null : _preview, child: Text(s.preview)),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(_note, key: const ValueKey('uae.profile.note'), style: text.bodyMedium?.copyWith(color: _note == s.saved ? Palette.accent : Palette.danger)),
                ],
                UaeThread(entries: entries),
              ],
            ),
          ),
          if (pending != null) UaeConfirmBar(busy: busy, onConfirm: postPending, onDiscard: discardPending),
        ],
      ),
    );
  }
}
