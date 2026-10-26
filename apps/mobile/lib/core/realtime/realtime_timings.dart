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
    this.jitter = 0.5,
    this.serverDisconnectMinWaitMs = 1000,
    this.serverDisconnectMaxWaitMs = 15000,
    this.offlineFailures = 2,
    this.offlineSeconds = 8,
    this.probeTimeoutMs = 3000,
    this.tokenRefreshLeadSec = 120,
    this.pollingFallbackAfter = 3,
    this.pollingFallbackIntervalSeconds = 30,
    this.reconnectedDebounceSeconds = 5,
    this.refetchJitterMs = 3000,
  });

  /// Reads the contract's keys (docs/runbooks/REALTIME_LIFECYCLE.md §3):
  /// reconnectMinMs, reconnectMaxMs, reconnectJitter, serverDisconnectMin /
  /// MaxWaitMs, offlineFailures, offlineSeconds, probeTimeoutMs,
  /// tokenRefreshLeadSeconds, pollingFallbackIntervalSeconds,
  /// reconnectedDebounceSeconds, refetchJitterMs (+ `pollingFallbackAfter`);
  /// anything missing, mistyped or absurd falls back to the default. The
  /// older short names (`jitter`, `tokenRefreshLeadSec`) still work.
  factory RealtimeTimings.fromJson(Object? json) {
    if (json is! Map) return const RealtimeTimings();
    const d = RealtimeTimings();
    int pick(List<String> keys, int fallback, int lo, int hi) {
      for (final key in keys) {
        final v = json[key];
        if (v is num) return v.toInt().clamp(lo, hi);
      }
      return fallback;
    }

    final jitter = json['reconnectJitter'] ?? json['jitter'];
    final min = pick(['reconnectMinMs'], d.reconnectMinMs, 100, 60000);
    final waitMin = pick(
      ['serverDisconnectMinWaitMs'],
      d.serverDisconnectMinWaitMs,
      0,
      60000,
    );
    return RealtimeTimings(
      reconnectMinMs: min,
      reconnectMaxMs: math.max(
        min,
        pick(['reconnectMaxMs'], d.reconnectMaxMs, 1000, 300000),
      ),
      jitter: jitter is num ? jitter.toDouble().clamp(0.0, 1.0) : d.jitter,
      serverDisconnectMinWaitMs: waitMin,
      serverDisconnectMaxWaitMs: math.max(
        waitMin,
        pick(
          ['serverDisconnectMaxWaitMs'],
          d.serverDisconnectMaxWaitMs,
          0,
          120000,
        ),
      ),
      offlineFailures: pick(['offlineFailures'], d.offlineFailures, 1, 10),
      offlineSeconds: pick(['offlineSeconds'], d.offlineSeconds, 1, 120),
      probeTimeoutMs: pick(['probeTimeoutMs'], d.probeTimeoutMs, 500, 30000),
      tokenRefreshLeadSec: pick(
        ['tokenRefreshLeadSeconds', 'tokenRefreshLeadSec'],
        d.tokenRefreshLeadSec,
        10,
        600,
      ),
      pollingFallbackAfter:
          pick(['pollingFallbackAfter'], d.pollingFallbackAfter, 1, 20),
      pollingFallbackIntervalSeconds: pick(
        ['pollingFallbackIntervalSeconds'],
        d.pollingFallbackIntervalSeconds,
        5,
        600,
      ),
      reconnectedDebounceSeconds: pick(
        ['reconnectedDebounceSeconds'],
        d.reconnectedDebounceSeconds,
        0,
        120,
      ),
      refetchJitterMs: pick(['refetchJitterMs'], d.refetchJitterMs, 0, 30000),
    );
  }

  /// From the bootstrap's `app_config` (object values arrive JSON-encoded).
  /// Order: the old flat knobs `client.realtime_reconnect_min_ms` /
  /// `client.realtime_reconnect_max_ms` (read-only fallback for servers that
  /// still send them; the admin knob is now `realtime.reconnect_*`, which
  /// arrives inside `client.timings`; remove the fallback one release after
  /// the server stopped sending them), then the `client.timings` object (or a
  /// `client` object holding `timings`) which may carry every key and wins
  /// where it speaks.
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
  /// to the step); the server's default is 0.5.
  final double jitter;
  final int serverDisconnectMinWaitMs;
  final int serverDisconnectMaxWaitMs;
  final int offlineFailures;
  final int offlineSeconds;
  final int probeTimeoutMs;
  final int tokenRefreshLeadSec;
  final int pollingFallbackAfter;
  final int pollingFallbackIntervalSeconds;
  final int reconnectedDebounceSeconds;
  final int refetchJitterMs;
}
