import 'package:flutter/services.dart';

/// 2026-10-26 (smoothness P7): the one place the app's taps buzz from.
///
/// Every call site used to call [HapticFeedback] itself; now they call
/// these, each with the same strength as before (no behaviour change):
/// a future vibration setting or a tuning pass touches this file only.
/// `test/core/design_system/app_haptics_test.dart` keeps [HapticFeedback]
/// out of the rest of `lib/`.
abstract final class AppHaptics {
  /// A selection changed (tabs, chips, toggles, pickers).
  static Future<void> selection() => HapticFeedback.selectionClick();

  /// A light tap (small confirmations).
  static Future<void> light() => HapticFeedback.lightImpact();

  /// A medium tap (long-press menus, sends, strong confirmations).
  static Future<void> medium() => HapticFeedback.mediumImpact();

  /// A heavy tap (rare, e.g. an incoming call).
  static Future<void> heavy() => HapticFeedback.heavyImpact();
}
