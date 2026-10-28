import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/network/api_error.dart';

/// S15-7: registers the FCM token with the server and keeps it registered.
///
/// A failed `POST /push-tokens` used to be swallowed ("the next app start
/// registers again"), so a phone that stays open for weeks had no push after
/// one blip. Now:
/// - a failure is retried with backoff (5 s, 30 s, 2 min, 10 min, 30 min,
///   then every 30 min) until it works or a newer token / sign-out replaces
///   the attempt;
/// - a success is time-stamped; [onResume] registers again when the last
///   success is older than [reregisterAfter] (7 days), as FCM advises (the
///   server keeps `lastSeenAt` and prunes tokens it has not seen for 60 days).
class PushRegistrar {
  PushRegistrar({
    required Future<void> Function(String token) send,
    required Future<int?> Function() readLastRegisteredMs,
    required Future<void> Function(int ms) writeLastRegisteredMs,
    Future<String?> Function()? currentToken,
    this.delays = const [
      Duration(seconds: 5),
      Duration(seconds: 30),
      Duration(minutes: 2),
      Duration(minutes: 10),
      Duration(minutes: 30),
    ],
    this.reregisterAfter = const Duration(days: 7),
    DateTime Function()? now,
    Future<void> Function(Duration)? sleep,
  })  : _send = send,
        _read = readLastRegisteredMs,
        _write = writeLastRegisteredMs,
        _currentToken = currentToken,
        _now = now ?? DateTime.now,
        _sleep = sleep ?? Future<void>.delayed;

  final Future<void> Function(String) _send;
  final Future<int?> Function() _read;
  final Future<void> Function(int) _write;
  final Future<String?> Function()? _currentToken;
  final DateTime Function() _now;
  final Future<void> Function(Duration) _sleep;
  final List<Duration> delays;
  final Duration reregisterAfter;

  String? _token;
  int _generation = 0;
  bool _stopped = false;

  /// The token last handed to [register].
  String? get token => _token;

  /// Registers [token]; retries until it succeeds. A newer call (a rotated
  /// token) or [stop] ends the older loop.
  Future<void> register(String token) async {
    _token = token;
    final mine = ++_generation;
    for (var attempt = 0;; attempt++) {
      if (_stopped || mine != _generation) return;
      try {
        await _send(token);
        await _write(_now().millisecondsSinceEpoch);
        return;
      } on Object catch (e) {
        debugPrint('push token not registered (try ${attempt + 1}): $e');
        // Owner 2026-10-28: a refusal the same request can never get past
        // (400 / 404 / 422 — e.g. an older server) is not retried: the next
        // app start or resume tries again (16 refused calls in 15 min were
        // seen in prod against an older server).
        if (isPermanentRefusal(e)) return;
        final wait =
            delays[attempt < delays.length ? attempt : delays.length - 1];
        await _sleep(wait);
      }
    }
  }

  /// App resumed: register again when the last success is [reregisterAfter]
  /// old (or never happened). Asks the platform for the token again when it
  /// can, since FCM may have rotated it quietly.
  Future<void> onResume() async {
    if (_stopped) return;
    final last = await _read();
    if (last != null) {
      final age = _now().difference(DateTime.fromMillisecondsSinceEpoch(last));
      if (age < reregisterAfter) return;
    }
    String? token;
    try {
      token = await _currentToken?.call();
    } on Object {
      token = null;
    }
    token ??= _token;
    if (token == null) return;
    await register(token);
  }

  /// A 4xx answer that repeating the same request cannot change (not 401,
  /// which the token refresh handles, nor 408 / 429, which pass with time).
  static bool isPermanentRefusal(Object e) {
    final status = e is ApiException ? e.statusCode : null;
    return status != null &&
        status >= 400 &&
        status < 500 &&
        status != 401 &&
        status != 408 &&
        status != 429;
  }

  /// Sign-out / another user: stop any retry loop.
  void stop() {
    _stopped = true;
    _generation++;
  }
}
