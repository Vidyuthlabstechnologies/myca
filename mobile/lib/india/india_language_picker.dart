import 'package:flutter/material.dart';

import '../app_state.dart';
import 'india_strings.dart';

/// The language list for the India app. The title is in both the current language and English so an owner
/// who landed in the wrong language can still find their way back.
Future<void> showIndiaLanguageSheet(BuildContext context) async {
  final state = AppScope.of(context);
  final current = state.language;
  final title = inText(context, 'Language');
  final picked = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(title == 'Language' ? title : '$title · Language', style: Theme.of(sheet).textTheme.titleMedium),
            ),
            ListTile(
              key: const Key('in.language.phone'),
              title: Text(inText(context, 'Same as my phone')),
              trailing: current.isEmpty || indiaChosenLocale(current) == null ? const Icon(Icons.check) : null,
              onTap: () => Navigator.of(sheet).pop(''),
            ),
            for (final language in indiaOfferedLanguages)
              ListTile(
                key: Key('in.language.${language.code}'),
                title: Text(language.nativeName),
                subtitle: language.code == 'en' ? null : Text(language.englishName),
                trailing: language.code == current ? const Icon(Icons.check) : null,
                onTap: () => Navigator.of(sheet).pop(language.code),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    ),
  );
  if (picked != null) await state.setLanguage(picked);
}

class IndiaLanguageButton extends StatelessWidget {
  const IndiaLanguageButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: const Key('in.language'),
      tooltip: inText(context, 'Language'),
      icon: const Icon(Icons.translate),
      onPressed: () => showIndiaLanguageSheet(context),
    );
  }
}
