import 'dart:convert';
import 'dart:math' as math;

/// Owner 2026-10-23 (big platform architecture, part C): every number that
/// decides how patient the phone is with a bad connection. The server may
/// tune them (`client.timings` in the bootstrap / session answer); a key it
/// does not send keeps the default here.
class RealtimeTimings {
  const RealtimeTimings({
    this.reconnectMinMs = 1000,
    this.reconnectMaxMs = 30000,
    this.jitter = 1.0,
    this.offlineFailures = 2,
    this.offlineSeconds = 8,
    this.tokenRefreshLeadSec = 120,
    this.pollingFallbackAfter = 3,
  });

  /// Reads `{reconnectMinMs, reconnectMaxMs, jitter, offlineFailures,
  /// offlineSeconds, tokenRefreshLeadSec, pollingFallbackAfter}`; anything
  /// missing, mistyped or absurd falls back to the default.
  factory RealtimeTimings.fromJson(Object? json) {
    if (json is! Map) return const RealtimeTimings();
    const d = RealtimeTimings();
    int pick(String key, int fallback, int lo, int hi) {
      final v = json[key];
      if (v is! num) return fallback;
      return v.toInt().clamp(lo, hi);
    }

    final jitter = json['jitter'];
    final min = pick('reconnectMinMs', d.reconnectMinMs, 100, 60000);
    return RealtimeTimings(
      reconnectMinMs: min,
      reconnectMaxMs: math.max(
        min,
        pick('reconnectMaxMs', d.reconnectMaxMs, 1000, 300000),
      ),
      jitter: jitter is num ? jitter.toDouble().clamp(0.0, 1.0) : d.jitter,
      offlineFailures: pick('offlineFailures', d.offlineFailures, 1, 10),
      offlineSeconds: pick('offlineSeconds', d.offlineSeconds, 1, 120),
      tokenRefreshLeadSec:
          pick('tokenRefreshLeadSec', d.tokenRefreshLeadSec, 10, 600),
      pollingFallbackAfter:
          pick('pollingFallbackAfter', d.pollingFallbackAfter, 1, 20),
    );
  }

  /// From the bootstrap's `app_config` (object values arrive JSON-encoded).
  /// Order: the admin panel's flat knobs `client.realtime_reconnect_min_ms` /
  /// `client.realtime_reconnect_max_ms` (shared with `ClientTuning`), then
  /// the `client.timings` object (or a `client` object holding `timings`)
  /// which may carry every key and wins where it speaks.
  factory RealtimeTimings.fromAppConfig(Map<String, String> config) {
    Object? decode(String? raw) {
      if (raw == null) return null;
      try {
        return jsonDecode(raw);
      } on FormatException {
        return null;
      }
    }

    final merged = <String, Object?>{};
    final flatMin =
        num.tryParse(config['client.realtime_reconnect_min_ms'] ?? '');
    final flatMax =
        num.tryParse(config['client.realtime_reconnect_max_ms'] ?? '');
    if (flatMin != null) merged['reconnectMinMs'] = flatMin;
    if (flatMax != null) merged['reconnectMaxMs'] = flatMax;
    final direct = decode(config['client.timings']);
    final client = decode(config['client']);
    final obj = direct is Map
        ? direct
        : (client is Map && client['timings'] is Map
            ? client['timings']
            : null);
    if (obj is Map) {
      for (final e in obj.entries) {
        merged['${e.key}'] = e.value;
      }
    }
    return RealtimeTimings.fromJson(merged);
  }

  final int reconnectMinMs;
  final int reconnectMaxMs;

  /// 0 = always the full step, 1 = full jitter (anywhere from the minimum
  /// to the step).
  final double jitter;
  final int offlineFailures;
  final int offlineSeconds;
  final int tokenRefreshLeadSec;
  final int pollingFallbackAfter;
}
