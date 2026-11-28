import '../format.dart';
import '../india/india_strings.dart';

// A message the offline engine says, in the app's language when it has one. The engine has no
// screen to ask, so it uses the language the app root keeps up to date.
String off(String english, [Map<String, Object?> parts = const {}]) => inFill(inDynamic(formatLanguage, english), parts);

String offMode(String mode) => switch (mode) {
  'cash' => off('cash'),
  'card' => off('card'),
  'bank' => off('bank'),
  _ => mode,
};
