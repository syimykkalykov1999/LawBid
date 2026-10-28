import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// The app's own page in the phone's settings, where a refused permission
/// (camera, contacts…) can be turned on again. iOS: the `app-settings:`
/// URL; Android: the native `openAppSettings` call of the app's
/// `lawbid/system_notifications` channel. Shared by every feature that
/// asks for a permission (moved here 2026-10-28 from SystemNotifications).
Future<void> openAppSettingsPage() async {
  try {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      await launchUrl(Uri.parse('app-settings:'));
      return;
    }
    await const MethodChannel('lawbid/system_notifications')
        .invokeMethod<void>('openAppSettings');
  } on Object {
    // Nothing to open on this platform.
  }
}
