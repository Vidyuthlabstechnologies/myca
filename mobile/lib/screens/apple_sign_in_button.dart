import 'package:flutter/material.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart' show AppleLogoPainter;

import '../uae/uae_cloud_strings.dart';
import '../uae/uae_strings.dart';

const appleSignInLabel = 'Continue with Apple';

class AppleSignInButton extends StatelessWidget {
  const AppleSignInButton({super.key, required this.onPressed, this.busy = false});

  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final background = dark ? Colors.white : Colors.black;
    final foreground = dark ? Colors.black : Colors.white;
    final logo = MediaQuery.textScalerOf(context).scale(18).clamp(18.0, 30.0);
    final s = UaeStrings.of(context);
    return Semantics(
      button: true,
      label: s.continueWithApple,
      excludeSemantics: true,
      child: FilledButton(
        key: const Key('signIn.apple'),
        style: FilledButton.styleFrom(
          backgroundColor: background,
          foregroundColor: foreground,
          disabledBackgroundColor: background.withValues(alpha: 0.6),
          disabledForegroundColor: foreground.withValues(alpha: 0.8),
          side: dark ? null : const BorderSide(color: Colors.black),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        onPressed: onPressed,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: logo,
              height: logo,
              child: CustomPaint(painter: AppleLogoPainter(color: foreground)),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                busy ? s.pleaseWait : s.continueWithApple,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
