import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/diagnostics/sentry_reporter.dart';
import 'package:lawbid/core/network/device_key.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-15: the app's own crash reports — free, in our database
/// (admin → Система → Вылеты). Errors are queued on the phone (a crash may
/// kill the app before anything is sent, so the queue is kept in local
/// storage), sent in small batches a little later or at the next start, and
/// the same error is reported once per session.
class CrashReporter {
  CrashReporter._(this._prefs, this._env, this._dio);

  static const _queueKey = 'crash.queue.v1';
  static const _maxQueue = 20;

  /// One report per request, each cut to ~6 KB: the load balancer's firewall
  /// refuses bodies over 8 KB (a batch of ten answered 403 and stayed queued).
  static const _batch = 1;
  static const _maxMessage = 500;
  static const _maxStack = 5000;
  static const _delay = Duration(seconds: 20);

  static CrashReporter? instance;

  /// Switched by the feature flag `crash_reports` (default on): off means
  /// nothing is queued or sent.
  static bool enabled = true;

  final SharedPreferences _prefs;
  final AppEnvironment _env;
  final Dio _dio;
  final _seen = <String>{};
  Timer? _timer;
  String? _route;
  Map<String, String>? _device;

  /// Hooks Flutter's and the engine's error channels. Safe to call once.
  static void install(
    SharedPreferences prefs,
    AppEnvironment env, {
    Dio? dio,
  }) {
    final reporter = CrashReporter._(
      prefs,
      env,
      dio ??
          Dio(
            BaseOptions(
              baseUrl: env.apiBaseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 10),
            ),
          ),
    );
    instance = reporter;
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      previous?.call(details);
      reporter.report(details.exception, details.stack);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      reporter.report(error, stack, fatal: true);
      return true;
    };
    // Whatever an earlier run left behind goes out soon.
    reporter._schedule();
  }

  /// The screen the person is on (set by the router's observer).
  static void setRoute(String? route) => instance?._route = route?.replaceAll(
        RegExp(
          '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
          caseSensitive: false,
        ),
        ':id',
      );

  /// Queues an error; never throws.
  void report(Object error, StackTrace? stack, {bool fatal = false}) {
    try {
      if (!enabled) return;
      // Owner 2026-10-20: the same error also goes to Sentry (own filter).
      SentryReporter.capture(error, stack, fatal: fatal, route: _route);
      final message = '${error.runtimeType}: $error';
      final trace = (stack ?? StackTrace.current).toString();
      final head = message.length > 160 ? message.substring(0, 160) : message;
      final key = '$head|${trace.split('\n').take(3).join('|')}';
      if (!_seen.add(key)) return;
      final queue = _read()
        ..add({
          'message': _clip(message, _maxMessage),
          'stack': _clip(trace, _maxStack),
          'fatal': fatal,
          'route': _route,
        });
      while (queue.length > _maxQueue) {
        queue.removeAt(0);
      }
      unawaited(_prefs.setString(_queueKey, jsonEncode(queue)));
      _schedule();
    } catch (_) {
      // Reporting must never be the next crash.
    }
  }

  List<Map<String, Object?>> _read() {
    final raw = _prefs.getString(_queueKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      return [
        for (final e in jsonDecode(raw) as List<Object?>)
          Map<String, Object?>.from(e! as Map),
      ];
    } catch (_) {
      return [];
    }
  }

  void _schedule() {
    if (_timer?.isActive ?? false) return;
    if (_read().isEmpty) return;
    _timer = Timer(_delay, () => unawaited(flush()));
  }

  Future<Map<String, String>> _deviceInfo() async {
    final cached = _device;
    if (cached != null) return cached;
    if (kIsWeb) return _device = {'deviceModel': 'browser', 'osVersion': 'web'};
    var model = 'unknown';
    var os = Platform.operatingSystemVersion;
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final a = await plugin.androidInfo;
        model = '${a.manufacturer} ${a.model}';
        os = 'Android ${a.version.release} (SDK ${a.version.sdkInt})';
      } else if (Platform.isIOS) {
        final i = await plugin.iosInfo;
        model = i.utsname.machine;
        os = 'iOS ${i.systemVersion}';
      }
    } catch (_) {
      // Keep the plain values.
    }
    return _device = {'deviceModel': model, 'osVersion': os};
  }

  /// Sends up to one batch; what the server did not take stays queued.
  Future<void> flush() async {
    final queue = _read();
    if (queue.isEmpty) return;
    if (!enabled) {
      await _prefs.setString(_queueKey, '[]');
      return;
    }
    final take = queue.take(_batch).toList();
    try {
      final device = await _deviceInfo();
      final key = DeviceKey.current;
      await _dio.post<void>(
        '/crash-reports',
        data: {
          'reports': [
            for (final r in take)
              {
                ...r,
                // Reports queued by an older build can be longer.
                'message': _clip('${r['message']}', _maxMessage),
                'stack': _clip('${r['stack']}', _maxStack),
                'platform': kIsWeb ? 'web' : Platform.operatingSystem,
                'appVersion': AppVersion.current,
                'build': '1',
                'flavor': _env.flavor.name,
                ...device,
              },
          ],
        },
        options: Options(headers: {if (key != null) 'X-Device-Key': key}),
      );
      final rest = _read();
      rest.removeRange(0, take.length.clamp(0, rest.length));
      await _prefs.setString(_queueKey, jsonEncode(rest));
      if (rest.isNotEmpty) _schedule();
    } catch (e) {
      if (kDebugMode) debugPrint('crash report not sent: $e');
      // Stays in the queue for the next start.
    }
  }

  static String _clip(String text, int max) =>
      text.length > max ? text.substring(0, max) : text;
}
