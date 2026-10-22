import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/diagnostics/sentry_reporter.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-22 (audit #11): native crashes were invisible — our own
/// list (admin → Вылеты) and the plain [SentryReporter] envelope only see
/// Dart errors. The Sentry SDK (`sentry_flutter`) adds what Dart cannot
/// catch: iOS/Android native crashes (CallKit, WebRTC, plugins, the
/// engine) and Android ANRs ("the app is not responding").
///
/// Same Sentry project and DSN as before (Admin → Ключи и сервисы → Sentry,
/// bootstrap `sentry.mobile_dsn`). The DSN of the last bootstrap is kept on
/// the phone so the next start watches for native crashes from its first
/// second, before any network answer.
///
/// Only a release build of the prod flavor on iOS/Android runs it; dev,
/// staging, debug builds and the web never do. Dart errors still arrive
/// through `CrashReporter` → [SentryReporter.capture] → [capture] (one
/// route, privacy-scrubbed), so the SDK's own Dart error hooks are removed
/// and nothing is sent twice. No user, no IP (`sendDefaultPii` off), no
/// screenshots, no view hierarchy; Dart events are scrubbed again in
/// `beforeSend` (native crash reports carry only native stacks).
class SentryNative {
  SentryNative._();

  static const _dsnKey = 'sentry.native_dsn.v1';

  static SentryNativeSdk _sdk = const _FlutterSdk();
  static SharedPreferences? _prefs;
  static String? _dsn;
  static bool? _releaseOverride;
  static bool? _supportedOverride;
  static Future<void> _chain = Future<void>.value();

  /// Whether the SDK is up (Dart errors then go through it).
  static bool get running => _dsn != null;

  /// Test hook: a fake SDK, whether this build counts as a release, and
  /// whether this platform has a native SDK.
  @visibleForTesting
  static void debugReset({
    SentryNativeSdk? sdk,
    bool? release,
    bool? supported,
  }) {
    _sdk = sdk ?? const _FlutterSdk();
    _prefs = null;
    _dsn = null;
    _releaseOverride = release;
    _supportedOverride = supported;
    _chain = Future<void>.value();
  }

  static bool _allowed(AppFlavor flavor) =>
      flavor == AppFlavor.prod &&
      (_releaseOverride ?? kReleaseMode) &&
      (_supportedOverride ??
          (!kIsWeb &&
              (defaultTargetPlatform == TargetPlatform.iOS ||
                  defaultTargetPlatform == TargetPlatform.android)));

  /// At start (core/config/run_app.dart): with the DSN the last bootstrap
  /// saved, if any. Never throws, never delays first paint.
  static Future<void> start(SharedPreferences prefs, AppFlavor flavor) {
    _prefs = prefs;
    if (!_allowed(flavor)) return Future<void>.value();
    return _apply(prefs.getString(_dsnKey));
  }

  /// With each bootstrap answer (via [SentryReporter.configure]): a new
  /// DSN restarts the SDK, an empty one stops it.
  static Future<void> configure(String? dsn, AppFlavor flavor) {
    if (!_allowed(flavor)) return Future<void>.value();
    final value = (dsn ?? '').trim();
    final prefs = _prefs;
    if (prefs != null) {
      unawaited(
        value.isEmpty ? prefs.remove(_dsnKey) : prefs.setString(_dsnKey, value),
      );
    }
    return _apply(value.isEmpty ? null : value);
  }

  static Future<void> _apply(String? dsn) => _chain = _chain.then((_) async {
        if (dsn == _dsn) return;
        try {
          if (_dsn != null) await _sdk.close();
          _dsn = null;
          if (dsn == null) return;
          await _sdk.init(
            dsn,
            release: 'lawbid@${AppVersion.current}+${AppVersion.build}',
            dist: AppVersion.build,
          );
          _dsn = dsn;
        } on Object catch (e) {
          debugPrint('sentry native off: $e');
          _dsn = null;
        }
      });

  /// A Dart error through the SDK (obfuscated stacks are symbolicated
  /// there). Never throws.
  static void capture(
    Object error,
    StackTrace? stack, {
    required bool fatal,
    String? route,
  }) {
    if (!running) return;
    try {
      unawaited(
        _sdk
            .capture(error, stack, fatal: fatal, route: route)
            .catchError((Object _) {}),
      );
    } catch (_) {
      // Reporting must never be the next crash.
    }
  }

  /// The privacy filter of the Dart-side events the SDK sends.
  @visibleForTesting
  static SentryEvent scrub(SentryEvent event) {
    event
      ..user = null
      ..request = null
      ..serverName = null;
    for (final e in event.exceptions ?? const <SentryException>[]) {
      final value = e.value;
      if (value != null) e.value = SentryReporter.scrubText(value);
    }
    final message = event.message;
    if (message != null) {
      event.message =
          SentryMessage(SentryReporter.scrubText(message.formatted));
    }
    return event;
  }
}

/// The SDK calls — `sentry_flutter` in the app, a fake in tests.
abstract class SentryNativeSdk {
  Future<void> init(
    String dsn, {
    required String release,
    required String dist,
  });

  Future<void> close();

  Future<void> capture(
    Object error,
    StackTrace? stack, {
    required bool fatal,
    String? route,
  });
}

class _FlutterSdk implements SentryNativeSdk {
  const _FlutterSdk();

  @override
  Future<void> init(
    String dsn, {
    required String release,
    required String dist,
  }) =>
      SentryFlutter.init((o) {
        o
          ..dsn = dsn
          ..environment = 'production'
          ..release = release
          ..dist = dist
          ..attachStacktrace = true
          ..enableNativeCrashHandling = true
          ..anrEnabled = true
          ..anrTimeoutInterval = const Duration(seconds: 5)
          ..sendDefaultPii = false
          ..attachScreenshot = false
          ..attachViewHierarchy = false
          ..beforeSend = (event, hint) => SentryNative.scrub(event);
        // Dart errors come through CrashReporter (scrubbed, one route);
        // the SDK's own hooks would send each of them twice.
        for (final i in List.of(o.integrations)) {
          final name = '${i.runtimeType}';
          if (i is OnErrorIntegration || name == 'FlutterErrorIntegration') {
            o.removeIntegration(i);
          }
        }
      });

  @override
  Future<void> close() => Sentry.close();

  @override
  Future<void> capture(
    Object error,
    StackTrace? stack, {
    required bool fatal,
    String? route,
  }) =>
      Sentry.captureException(
        error,
        stackTrace: stack,
        withScope: (scope) {
          scope.level = fatal ? SentryLevel.fatal : SentryLevel.error;
          if (route != null) unawaited(scope.setTag('route', route));
          unawaited(scope.setTag('flavor', 'prod'));
        },
      );
}
