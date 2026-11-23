import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_state.dart';

const usAiPermissionText =
    'To answer your questions, and to read a form or letter you photograph, MyCA sends it to Anthropic, the company that makes the Claude AI model.\n\n'
    'What is sent: the text of your question, or the photo or PDF you pick. Social Security numbers and ITINs are removed from the text of your messages first. A photo is sent as taken, so a number printed on it reaches Anthropic; the model is told not to read it, and MyCA removes any such number from what comes back.\n\n'
    'Anthropic may not train on it. The AI never works out a figure on your return; MyCA\'s tax rules do, and nothing is saved until you check it.\n\n'
    'If you say no, you can still type every form in yourself and finish your return. You can change this later in the app.';

abstract class UsAiPermissionStore {
  Future<bool?> read(String who);
  Future<void> write(String who, bool allowed);
}

class DeviceUsAiPermissionStore implements UsAiPermissionStore {
  static String _key(String who) => 'us.ai.allowed.$who';

  @override
  Future<bool?> read(String who) async {
    try {
      return (await SharedPreferences.getInstance()).getBool(_key(who));
    } on Object {
      return null;
    }
  }

  @override
  Future<void> write(String who, bool allowed) async {
    try {
      await (await SharedPreferences.getInstance()).setBool(_key(who), allowed);
    } on Object {
      return;
    }
  }
}

class MemoryUsAiPermissionStore implements UsAiPermissionStore {
  MemoryUsAiPermissionStore({Map<String, bool>? start, this.allowAll = false}) : values = {...?start};

  final Map<String, bool> values;
  final bool allowAll;

  @override
  Future<bool?> read(String who) async => values[who] ?? (allowAll ? true : null);

  @override
  Future<void> write(String who, bool allowed) async => values[who] = allowed;
}

UsAiPermissionStore usAiPermissionStore = DeviceUsAiPermissionStore();

String _who(AppState state) => state.snapshot?.activeUser?.userId ?? 'device';

Future<bool> usAiAllowed(AppState state) async => await usAiPermissionStore.read(_who(state)) ?? false;

Future<void> setUsAiAllowed(AppState state, bool allowed) => usAiPermissionStore.write(_who(state), allowed);

Future<bool> ensureUsAiPermission(BuildContext context) async {
  final state = AppScope.of(context);
  if (state.edition != 'US') return true;
  if (await usAiAllowed(state)) return true;
  if (!context.mounted) return false;
  final allowed = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialog) => AlertDialog(
      key: const Key('usAi.dialog'),
      title: const Text('Share with Anthropic\'s AI?'),
      content: const SingleChildScrollView(child: Text(usAiPermissionText, key: Key('usAi.text'))),
      actions: [
        TextButton(key: const Key('usAi.no'), onPressed: () => Navigator.of(dialog).pop(false), child: const Text('No, thanks')),
        FilledButton(key: const Key('usAi.yes'), onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Allow')),
      ],
    ),
  );
  await setUsAiAllowed(state, allowed == true);
  return allowed == true;
}
