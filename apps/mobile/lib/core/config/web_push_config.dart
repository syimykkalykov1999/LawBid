import 'package:firebase_core/firebase_core.dart';

/// Owner 2026-10-15 (web): the browser's push needs the Firebase *web* app
/// of the project and a VAPID key (Firebase console → Project settings →
/// Cloud Messaging → Web Push certificates). They are given at build time
/// (`--dart-define=FIREBASE_WEB_API_KEY=…`) or saved in the admin; without
/// them the web build simply has no push and everything else works.
abstract final class WebPushConfig {
  static const _apiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
  static const _appId = String.fromEnvironment('FIREBASE_WEB_APP_ID');
  static const _senderId = String.fromEnvironment('FIREBASE_WEB_SENDER_ID');
  static const _projectId = String.fromEnvironment('FIREBASE_WEB_PROJECT_ID');
  static const _authDomain = String.fromEnvironment('FIREBASE_WEB_AUTH_DOMAIN');
  static const _vapidKey = String.fromEnvironment('FIREBASE_WEB_VAPID_KEY');

  /// Owner 2026-11-02: the same values from Admin → Integrations → FCM,
  /// delivered by the bootstrap (`fcm.web.*` in app_config). A build-time
  /// value wins; the admin's fills in what the build lacks.
  static Map<String, String> _remote = const {};

  /// Called with every bootstrap's `app_config`.
  static void applyRemote(Map<String, String> appConfig) {
    _remote = {
      for (final e in appConfig.entries)
        if (e.key.startsWith('fcm.web.') && e.value.trim().isNotEmpty)
          e.key: e.value.trim(),
    };
  }

  static String _pick(String build, String remoteKey) =>
      build.isNotEmpty ? build : (_remote[remoteKey] ?? '');

  static String get apiKey => _pick(_apiKey, 'fcm.web.api_key');
  static String get appId => _pick(_appId, 'fcm.web.app_id');
  static String get senderId => _pick(_senderId, 'fcm.web.sender_id');
  static String get projectId => _pick(_projectId, 'fcm.web.project_id');
  static String get authDomain => _pick(_authDomain, 'fcm.web.auth_domain');
  static String get vapidKey => _pick(_vapidKey, 'fcm.web.vapid_key');

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
