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

  // 13.11 (owner row 95, motion catalog F4): the three iOS notification
  // haptics (`UINotificationFeedbackGenerator`, Apple HIG «Playing
  // haptics»), exposed by Flutter 3.47 `HapticFeedback` (BSD-3). Android
  // API 30+ maps them to CONFIRM / REJECT. The phone's own «System
  // haptics» / «Vibration» switch is honoured by the OS for every call.

  /// A task finished well (sent, paid, verified, task done, code scanned).
  static Future<void> success() => HapticFeedback.successNotification();

  /// Something needs care (a destructive confirm, a soft limit).
  static Future<void> warning() => HapticFeedback.warningNotification();

  /// Something failed (wrong code, invalid form, failed send).
  static Future<void> error() => HapticFeedback.errorNotification();
}
