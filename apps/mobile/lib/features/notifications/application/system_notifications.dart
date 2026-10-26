import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-15: the phone's own notification switch (Android 13+
/// runtime permission and the per-app toggle), independent of Firebase:
/// asked once at start, read for the settings screen, opened on demand, and
/// tried with a local notification through the app's own channel.
class SystemNotifications {
  const SystemNotifications();

  static const _channel = MethodChannel('lawbid/system_notifications');

  /// Whether the system lets this app show notifications now.
  Future<bool> enabled() async {
    try {
      return await _channel.invokeMethod<bool>('enabled') ?? true;
    } on Object {
      // iOS / tests: the push SDK asks and reports on its own.
      return true;
    }
  }

  /// Shows the system's permission dialog when it is still needed.
  Future<bool> request() async {
    try {
      return await _channel.invokeMethod<bool>('request') ?? true;
    } on Object {
      return true;
    }
  }

  Future<void> openSettings() async {
    try {
      await _channel.invokeMethod<void>('openSettings');
    } on Object {
      // Nothing to open on this platform.
    }
  }

  /// The app's own page in the phone's settings, where a refused
  /// permission (contacts…) can be turned on again.
  Future<void> openAppSettings() async {
    try {
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
        await launchUrl(Uri.parse('app-settings:'));
        return;
      }
      await _channel.invokeMethod<void>('openAppSettings');
    } on Object {
      // Nothing to open on this platform.
    }
  }

  /// A local notification on the «general» channel (sound as the channel
  /// says); false when the system blocks notifications.
  Future<bool> showTest(String title, String body) async {
    try {
      return await _channel.invokeMethod<bool>('showTest', {
            'title': title,
            'body': body,
          }) ??
          false;
    } on Object {
      return false;
    }
  }
}

final systemNotificationsProvider =
    Provider<SystemNotifications>((ref) => const SystemNotifications());

/// Re-read when the settings screen comes back from the phone's settings.
final systemNotificationsEnabledProvider = FutureProvider.autoDispose<bool>(
  (ref) => ref.watch(systemNotificationsProvider).enabled(),
);
