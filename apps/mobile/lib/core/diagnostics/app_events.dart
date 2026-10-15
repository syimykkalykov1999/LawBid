import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-15: the app's own usage events — free, in our database
/// (admin → Деньги → Аналитика: the most visited screens and actions).
///
/// Events (a screen opened, the app started, a few key actions) wait in a
/// small queue kept in local storage and go out in ONE request: when 20
/// have piled up, every minute, and the moment the app goes to the
/// background. Nothing identifies a person; the server only adds up counts
/// per day. Off with the flag `app_events` ([enabled] is switched from the
/// feature flags): nothing is queued or sent.
class AppEvents {
  AppEvents._(this._prefs, this._dio);

  static const _queueKey = 'events.queue.v1';
  static const _maxQueue = 200;
  static const _batch = 50;
  static const _flushAt = 20;
  static const _every = Duration(seconds: 60);

  static AppEvents? instance;

  /// Switched by the feature flag `app_events` (default on).
  static bool enabled = true;

  final SharedPreferences _prefs;
  final Dio _dio;
  Timer? _timer;
  String? _lastScreen;
  List<Map<String, String>>? _queue;
  _Lifecycle? _observer;

  /// Starts collecting. Safe to call once, before `runApp`.
  static void install(SharedPreferences prefs, AppEnvironment env, {Dio? dio}) {
    instance?._dispose();
    final events = AppEvents._(
      prefs,
      dio ??
          Dio(
            BaseOptions(
              baseUrl: env.apiBaseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 10),
            ),
          ),
    );
    instance = events;
    events._observer = _Lifecycle(events);
    WidgetsBinding.instance.addObserver(events._observer!);
    track('app_open');
  }

  /// One event; never throws.
  static void track(String name, {String? screen}) =>
      instance?._add(name, screen);

  /// The person opened a screen (called by the router). The same screen
  /// twice in a row counts once.
  static void screen(String? route) {
    final self = instance;
    if (self == null || route == null) return;
    final clean = normalizeRoute(route);
    if (clean.isEmpty || clean == '/splash' || clean == self._lastScreen) {
      return;
    }
    self
      .._lastScreen = clean
      .._add('screen_view', clean);
  }

  /// Ids and the query string out, so one screen is one row.
  @visibleForTesting
  static String normalizeRoute(String route) {
    final path = route.split('?').first;
    final cleaned = path
        .replaceAll(
          RegExp(
            '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            caseSensitive: false,
          ),
          ':id',
        )
        .replaceAll(RegExp(r'/\d+'), '/:id');
    return cleaned.length > 80 ? cleaned.substring(0, 80) : cleaned;
  }

  void _add(String name, String? screen) {
    try {
      if (!enabled) return;
      final queue = _read()
        ..add({'name': name, if (screen != null) 'screen': screen});
      while (queue.length > _maxQueue) {
        queue.removeAt(0);
      }
      _write(queue);
      if (queue.length >= _flushAt) {
        unawaited(flush());
      } else {
        _schedule();
      }
    } catch (_) {
      // Counting must never be a problem for the app.
    }
  }

  List<Map<String, String>> _read() {
    final cached = _queue;
    if (cached != null) return List.of(cached);
    final raw = _prefs.getString(_queueKey);
    var list = <Map<String, String>>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        list = [
          for (final e in jsonDecode(raw) as List<Object?>)
            Map<String, String>.from(e! as Map),
        ];
      } catch (_) {
        list = [];
      }
    }
    _queue = list;
    return List.of(list);
  }

  void _write(List<Map<String, String>> queue) {
    _queue = queue;
    unawaited(_prefs.setString(_queueKey, jsonEncode(queue)));
  }

  void _schedule() {
    if (_timer?.isActive ?? false) return;
    _timer = Timer(_every, () => unawaited(flush()));
  }

  /// Sends up to one batch; what the server did not take stays queued.
  Future<void> flush() async {
    _timer?.cancel();
    final queue = _read();
    if (queue.isEmpty) return;
    if (!enabled) {
      _write([]);
      return;
    }
    final take = queue.take(_batch).toList();
    try {
      await _dio.post<void>('/app-events', data: {'events': take});
      final rest = _read()..removeRange(0, take.length.clamp(0, queue.length));
      _write(rest);
      if (rest.length >= _flushAt) {
        unawaited(flush());
      } else if (rest.isNotEmpty) {
        _schedule();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('app events not sent: $e');
      _schedule();
    }
  }

  void _dispose() {
    _timer?.cancel();
    final o = _observer;
    if (o != null) WidgetsBinding.instance.removeObserver(o);
  }
}

class _Lifecycle with WidgetsBindingObserver {
  _Lifecycle(this._events);

  final AppEvents _events;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      unawaited(_events.flush());
    }
  }
}
