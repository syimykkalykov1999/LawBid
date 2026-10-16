import 'package:firebase_core/firebase_core.dart';

/// Owner 2026-10-15 (web): the browser's push needs the Firebase *web* app
/// of the project and a VAPID key (Firebase console → Project settings →
/// Cloud Messaging → Web Push certificates). They are given at build time
/// (`--dart-define=FIREBASE_WEB_API_KEY=…`); without them the web build
/// simply has no push and everything else works.
abstract final class WebPushConfig {
  static const apiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
  static const appId = String.fromEnvironment('FIREBASE_WEB_APP_ID');
  static const senderId = String.fromEnvironment('FIREBASE_WEB_SENDER_ID');
  static const projectId = String.fromEnvironment('FIREBASE_WEB_PROJECT_ID');
  static const authDomain = String.fromEnvironment('FIREBASE_WEB_AUTH_DOMAIN');
  static const vapidKey = String.fromEnvironment('FIREBASE_WEB_VAPID_KEY');

  static bool get configured =>
      apiKey.isNotEmpty &&
      appId.isNotEmpty &&
      senderId.isNotEmpty &&
      projectId.isNotEmpty &&
      vapidKey.isNotEmpty;

  static FirebaseOptions get options => FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: senderId,
        projectId: projectId,
        authDomain: authDomain.isEmpty ? null : authDomain,
      );
}
