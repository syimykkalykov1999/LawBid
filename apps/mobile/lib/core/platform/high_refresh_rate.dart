import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_displaymode/flutter_displaymode.dart';

/// Owner 2026-11-03: on 120 Hz Android phones (Samsung S-series) Flutter
/// draws at 60 Hz unless the app asks the system for the fastest display
/// mode, so animations looked laggy although the app is fast. The proven
/// fix is the `flutter_displaymode` package (MIT):
/// `FlutterDisplayMode.setHighRefreshRate()` once at startup.
///
/// Android only. iPhones with ProMotion run at 120 Hz by themselves because
/// `CADisableMinimumFrameDurationOnPhone` is set in `ios/Runner/Info.plist`.
/// The web and tests never touch the plugin. Never throws and never delays
/// the first frame (the caller does not await it).
class HighRefreshRate {
  HighRefreshRate._();

  /// What actually asks the system; replaced in tests.
  @visibleForTesting
  static Future<void> Function() request =
      FlutterDisplayMode.setHighRefreshRate;

  /// Where the failure goes; replaced in tests.
  @visibleForTesting
  static void Function(String message) log = debugPrint;

  /// Asks for the highest refresh rate. Returns true when the request was
  /// made and accepted, false when skipped (web, iOS, ...) or failed.
  static Future<bool> enable() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return false;
    }
    try {
      await request();
      log('refresh rate: highest mode requested');
      return true;
    } on Object catch (e) {
      // An old device or a platform without display modes: the app just
      // stays at the system's default rate.
      log('refresh rate: not changed ($e)');
      return false;
    }
  }
}
