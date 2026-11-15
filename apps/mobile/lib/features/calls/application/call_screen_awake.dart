import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Turns «keep the screen on» on or off.
typedef CallScreenAwake = Future<void> Function({required bool on});

/// Row 166 (WhatsApp / FaceTime keep the screen on in a video call):
/// wakelock_plus (fluttercommunity, BSD-3) — Android `FLAG_KEEP_SCREEN_ON`,
/// iOS `isIdleTimerDisabled`, the Screen Wake Lock API on the web. A phone
/// or test without the plugin just keeps its own timeout.
final callScreenAwakeProvider = Provider<CallScreenAwake>(
  (ref) => ({required bool on}) async {
    try {
      await WakelockPlus.toggle(enable: on);
    } on Object {
      // No plugin here (tests, desktop): the system timeout stays.
    }
  },
);
