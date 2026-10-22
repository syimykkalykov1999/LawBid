import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Security research #5 (2026-10-22), B5: a screen with an ID document or
/// a licence on it must not end up in a screenshot or a screen recording.
/// Android: `FLAG_SECURE` on the window while such a screen is open (the
/// system draws black instead; also hides it in the app switcher). iPhone:
/// a screenshot cannot be stopped, but a screen recording / mirroring can be
/// blanked — the native side covers the window while `UIScreen.isCaptured`
/// is on. Not for chats (like Telegram) — only the verification screens.
///
/// Nested screens (the camera over the wizard) are counted: the flag goes
/// only when the last one closes. Web, tests and other platforms: no-op.
class SecureScreen {
  SecureScreen._();

  static const MethodChannel _channel = MethodChannel('lawbid/secure_screen');

  static int _holders = 0;

  @visibleForTesting
  static int get holders => _holders;

  static bool get _supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// One more screen that must stay private.
  static Future<void> acquire() async {
    _holders++;
    if (_holders == 1) await _set(true);
  }

  /// That screen closed; the window is public again once none is left.
  static Future<void> release() async {
    if (_holders == 0) return;
    _holders--;
    if (_holders == 0) await _set(false);
  }

  static Future<void> _set(bool secure) async {
    if (!_supported) return;
    try {
      await _channel.invokeMethod<void>('setSecure', {'secure': secure});
    } on Object catch (e) {
      // An old native build without the handler: nothing to do.
      debugPrint('secure screen: $e');
    }
  }
}

/// Keeps the window private while [child] is in the tree.
class SecureScreenScope extends StatefulWidget {
  const SecureScreenScope({required this.child, super.key});

  final Widget child;

  @override
  State<SecureScreenScope> createState() => _SecureScreenScopeState();
}

class _SecureScreenScopeState extends State<SecureScreenScope> {
  @override
  void initState() {
    super.initState();
    unawaited(SecureScreen.acquire());
  }

  @override
  void dispose() {
    unawaited(SecureScreen.release());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
