import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/config/app_environment.dart';

/// Owner 2026-10-20: the app's errors also go to Sentry (project
/// `lawbid-mobile`), next to our own crash list (admin → Вылеты). The DSN is
/// saved in Admin → Ключи и сервисы → Sentry and arrives in the bootstrap's
/// `app_config` (`sentry.mobile_dsn`), so changing it needs no new build.
///
/// A plain HTTPS envelope over dio — no native SDK, so it adds nothing to the
/// iOS/Android builds; native (C++/Kotlin/Swift) crashes are not covered, the
/// Dart-side ones (Flutter framework, async, platform channel) are.
///
/// Nothing personal leaves the phone: only the error type, a masked message
/// (e-mails, phone numbers and URL queries removed), the stack, the screen
/// route with ids replaced, the app version/flavor and the platform. No user
/// id, name, phone, e-mail, request body or message text.
///
/// Sent only from a release build of the prod flavor and only while a DSN is
/// set; before the bootstrap answer errors wait in memory.
class SentryReporter {
  SentryReporter._();

  static const _maxPending = 10;
  static const _maxPerSession = 30;

  static final _pending = <_Captured>[];
  static final _seen = <String>{};
  static Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );
  static _Dsn? _dsn;
  static AppFlavor? _flavor;
  static var _sent = 0;

  /// Test hook: the HTTP client and whether this build may report.
  @visibleForTesting
  static void debugReset({Dio? dio, bool? release}) {
    _pending.clear();
    _seen.clear();
    _dsn = null;
    _flavor = null;
    _sent = 0;
    _releaseOverride = release;
    if (dio != null) _dio = dio;
  }

  static bool? _releaseOverride;

  static bool get _active =>
      _flavor == AppFlavor.prod && (_releaseOverride ?? kReleaseMode);

  /// Called with each bootstrap answer. An empty/invalid DSN switches it off.
  static void configure(String? dsn, AppFlavor flavor) {
    _flavor = flavor;
    _dsn = _Dsn.tryParse(dsn);
    if (!_active || _dsn == null) {
      _pending.clear();
      return;
    }
    final waiting = List<_Captured>.of(_pending);
    _pending.clear();
    for (final c in waiting) {
      unawaited(_send(c));
    }
  }

  /// Queues an error; never throws.
  static void capture(
    Object error,
    StackTrace? stack, {
    bool fatal = false,
    String? route,
  }) {
    try {
      final release = _releaseOverride ?? kReleaseMode;
      if (!release || (_flavor != null && _flavor != AppFlavor.prod)) return;
      final c = _Captured(
        type: error is DioException ? 'DioException' : '${error.runtimeType}',
        message: scrubMessage(error),
        stack: (stack ?? StackTrace.current).toString(),
        fatal: fatal,
        route: route,
      );
      final key = '${c.type}|${c.message}|${c.stack.split('\n').take(3)}';
      if (!_seen.add(key)) return;
      if (_dsn == null) {
        if (_flavor != null) return; // answered: no DSN → off
        _pending.add(c);
        if (_pending.length > _maxPending) _pending.removeAt(0);
        return;
      }
      unawaited(_send(c));
    } catch (_) {
      // Reporting must never be the next crash.
    }
  }

  /// A message with no personal data: e-mails, phone-like numbers and URL
  /// queries removed; a network error is reduced to its kind, status, path.
  @visibleForTesting
  static String scrubMessage(Object error) {
    var text = error is DioException
        ? 'DioException(${error.type.name}) '
            '${error.response?.statusCode ?? ''} '
            '${error.requestOptions.method} ${error.requestOptions.path}'
        : error.toString();
    text = text
        .replaceAll(RegExp(r'[^\s@]+@[^\s@]+\.[^\s@]+'), '[email]')
        .replaceAll(RegExp(r'\+?\d[\d\s().-]{7,}\d'), '[number]')
        .replaceAllMapped(RegExp(r'(https?://[^\s?#]+)[?#]\S*'), (m) => m[1]!);
    return text.length > 500 ? text.substring(0, 500) : text.trim();
  }

  /// Dart stack lines (`#0  Foo.bar (package:lawbid/x.dart:12:3)`), newest
  /// last as Sentry wants; lines that do not parse (AOT-obfuscated) are
  /// kept raw by the caller in `extra`.
  @visibleForTesting
  static List<Map<String, Object?>> frames(String stack) {
    final re = RegExp(r'^#\d+\s+(.*?)\s+\((.+?):(\d+):(\d+)\)$');
    final out = <Map<String, Object?>>[];
    for (final line in stack.split('\n')) {
      final m = re.firstMatch(line.trim());
      if (m == null) continue;
      out.add({
        'function': m[1],
        'filename': m[2],
        'lineno': int.parse(m[3]!),
        'colno': int.parse(m[4]!),
        'in_app': m[2]!.startsWith('package:lawbid/'),
      });
    }
    return out.reversed.toList();
  }

  static String _id() {
    final r = Random.secure();
    return List.generate(32, (_) => r.nextInt(16).toRadixString(16)).join();
  }

  static String _platform() {
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      TargetPlatform.fuchsia ||
      TargetPlatform.linux ||
      TargetPlatform.macOS ||
      TargetPlatform.windows =>
        'web',
    };
  }

  static Future<void> _send(_Captured c) async {
    final dsn = _dsn;
    if (dsn == null || _sent >= _maxPerSession) return;
    _sent++;
    try {
      final id = _id();
      final parsed = frames(c.stack);
      final event = <String, Object?>{
        'event_id': id,
        'timestamp': DateTime.now().toUtc().millisecondsSinceEpoch / 1000,
        'platform': 'other',
        'level': c.fatal ? 'fatal' : 'error',
        'environment': 'production',
        'release': 'lawbid@${AppVersion.current}',
        'tags': {
          'os': _platform(),
          'flavor': 'prod',
          if (c.route != null) 'route': c.route,
        },
        'exception': {
          'values': [
            {
              'type': c.type,
              'value': c.message,
              if (parsed.isNotEmpty) 'stacktrace': {'frames': parsed},
            },
          ],
        },
        if (parsed.isEmpty)
          'extra': {
            'stack':
                c.stack.length > 8000 ? c.stack.substring(0, 8000) : c.stack,
          },
      };
      final body = [
        jsonEncode({'event_id': id, 'dsn': dsn.raw}),
        jsonEncode({'type': 'event'}),
        jsonEncode(event),
      ].join('\n');
      await _dio.post<void>(
        dsn.envelopeUrl,
        data: body,
        options: Options(
          contentType: 'application/x-sentry-envelope',
          headers: {
            'X-Sentry-Auth': 'Sentry sentry_version=7, '
                'sentry_client=lawbid-dart/1, sentry_key=${dsn.key}',
          },
        ),
      );
    } catch (e) {
      if (kDebugMode) debugPrint('sentry not sent: $e');
    }
  }
}

class _Captured {
  const _Captured({
    required this.type,
    required this.message,
    required this.stack,
    required this.fatal,
    required this.route,
  });

  final String type;
  final String message;
  final String stack;
  final bool fatal;
  final String? route;
}

class _Dsn {
  const _Dsn(this.raw, this.key, this.envelopeUrl);

  final String raw;
  final String key;
  final String envelopeUrl;

  /// `https://<key>@<host>/<projectId>` → the project's envelope endpoint.
  static _Dsn? tryParse(String? dsn) {
    if (dsn == null || dsn.isEmpty) return null;
    final uri = Uri.tryParse(dsn);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.userInfo.isEmpty ||
        uri.host.isEmpty) {
      return null;
    }
    final project = uri.pathSegments.where((s) => s.isNotEmpty).lastOrNull;
    if (project == null || int.tryParse(project) == null) return null;
    final key = uri.userInfo.split(':').first;
    return _Dsn(
      dsn,
      key,
      'https://${uri.host}${uri.hasPort ? ':${uri.port}' : ''}'
      '/api/$project/envelope/',
    );
  }
}
