import 'dart:async';

import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/web_push_config.dart';

/// Security research #5 (2026-10-22), B1: Firebase App Check — the proof
/// that a request comes from our real app and not from a script with the
/// same public keys (docs/runbooks/APP_CHECK.md). The SDK gets a
/// short-lived token from Firebase (Play Integrity on Android, App Attest
/// with DeviceCheck as the fallback on iPhone, reCAPTCHA Enterprise on the
/// web) and refreshes it itself; `AppCheckInterceptor`
/// (core/network/app_check_interceptor.dart) puts it on the costly
/// anonymous auth routes as `X-Firebase-AppCheck`.
///
/// Nothing here ever blocks the app: a build without the Firebase files
/// (dev / staging on Android), a phone without Play services, a failed
/// attestation — the token is simply absent and the request goes out
/// without the header (the server decides by `security.app_check.mode`).
///
/// The current App Check token, or null when there is none (not activated,
/// no Firebase in this build, attestation failed, timeout).
typedef AppCheckToken = Future<String?> Function({bool forceRefresh});

/// The real client over `firebase_app_check` (FlutterFire).
class FirebaseAppCheckClient {
  FirebaseAppCheckClient._();

  static final FirebaseAppCheckClient instance = FirebaseAppCheckClient._();

  /// `--dart-define=APP_CHECK_DEBUG=true` (config/dev.json): the debug
  /// providers for emulators / simulators. The token they print in the
  /// console is registered in Firebase → App Check → the app → «Manage
  /// debug tokens»; `APP_CHECK_DEBUG_TOKEN` pins it instead of a random one.
  static const debugProviders = bool.fromEnvironment('APP_CHECK_DEBUG');
  static const _debugToken = String.fromEnvironment('APP_CHECK_DEBUG_TOKEN');

  /// Web: the reCAPTCHA Enterprise site key of the web app (Firebase →
  /// App Check → the web app). Empty = App Check off on the web.
  static const webRecaptchaKey =
      String.fromEnvironment('FIREBASE_WEB_RECAPTCHA_KEY');

  /// How long a request waits for a token before going without one.
  static const tokenTimeout = Duration(seconds: 5);

  Future<bool>? _activation;

  /// Starts Firebase (when this build has its files) and App Check. Called
  /// once at launch (core/config/run_app.dart), never awaited there: the
  /// first request that needs a token waits for it in [token].
  Future<bool> start() => _activation ??= _activate();

  bool get activated => _activated;
  bool _activated = false;

  Future<bool> _activate() async {
    try {
      if (kIsWeb && !WebPushConfig.configured) {
        debugPrint('app check: no Firebase web keys in this build');
        return false;
      }
      if (kIsWeb && webRecaptchaKey.isEmpty && !debugProviders) {
        debugPrint('app check: no FIREBASE_WEB_RECAPTCHA_KEY in this build');
        return false;
      }
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: kIsWeb ? WebPushConfig.options : null,
        );
      }
      await FirebaseAppCheck.instance.activate(
        providerWeb: !kIsWeb
            ? null
            : debugProviders
                ? WebDebugProvider(
                    debugToken: _debugToken.isEmpty ? null : _debugToken,
                  )
                : ReCaptchaEnterpriseProvider(webRecaptchaKey),
        providerAndroid: debugProviders
            ? AndroidDebugProvider(
                debugToken: _debugToken.isEmpty ? null : _debugToken,
              )
            : const AndroidPlayIntegrityProvider(),
        providerApple: debugProviders
            ? AppleDebugProvider(
                debugToken: _debugToken.isEmpty ? null : _debugToken,
              )
            : const AppleAppAttestWithDeviceCheckFallbackProvider(),
      );
      _activated = true;
      debugPrint('app check: on (${_providerName()})');
      return true;
    } on Object catch (e) {
      // No google-services.json / GoogleService-Info.plist in this build,
      // or the native SDK refused: the app works, just without the header.
      debugPrint('app check: off ($e)');
      return false;
    }
  }

  static String _providerName() {
    if (debugProviders) return 'debug';
    if (kIsWeb) return 'reCAPTCHA Enterprise';
    return defaultTargetPlatform == TargetPlatform.iOS
        ? 'App Attest / DeviceCheck'
        : 'Play Integrity';
  }

  Future<String?> token({bool forceRefresh = false}) async {
    try {
      final on = await start().timeout(tokenTimeout);
      if (!on) return null;
      final t = await FirebaseAppCheck.instance
          .getToken(forceRefresh)
          .timeout(tokenTimeout);
      return (t == null || t.isEmpty) ? null : t;
    } on Object catch (e) {
      debugPrint('app check: no token ($e)');
      return null;
    }
  }
}

/// Overridable in tests; the app uses the Firebase client.
final appCheckTokenProvider =
    Provider<AppCheckToken>((ref) => FirebaseAppCheckClient.instance.token);
