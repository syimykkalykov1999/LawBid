/// Scale audit 2026-10-23: the knobs of the phone's own traffic (repeats of
/// a failed request, reconnects of the live connection, polling, usage
/// events). A store release takes days; if a build misbehaves under load
/// the server raises these numbers in the admin panel and every phone
/// follows at its next start (`GET /config/bootstrap`, `client.*`).
///
/// The starter values are what the app did before the knobs existed, so a
/// server that sends nothing changes nothing. Every value is clamped to the
/// same bounds the API enforces on save
/// (api/src/common/app-settings/client-tuning.ts): a wrong number can
/// neither silence the app nor make it hammer the server.
abstract final class ClientTuning {
  static int _retryMax = 2;
  static int _retryBaseMs = 1000;
  static int _retryAfterMaxS = 10;
  static int _outboxRetryMaxS = 30;
  static int _reconnectMinMs = 1000;
  static int _reconnectMaxMs = 10000;
  static bool _eventsEnabled = true;
  static int _eventsFlushS = 60;
  static int _callSyncS = 30;
  static int _qrPollS = 10;
  static int _resumeMinAwayS = 30;
  static int _videoPrefetchAhead = 3;
  static String _videoPrefetchMode = 'auto';
  static double _chatPhotoMaxPx = 1600;
  static int _chatPhotoQuality = 82;

  /// Repeats of a failed safe request (RetryInterceptor).
  static int get retryMax => _retryMax;

  /// First wait before a repeat; doubles each time.
  static Duration get retryBase => Duration(milliseconds: _retryBaseMs);

  /// The longest `Retry-After` the app obeys.
  static Duration get retryAfterMax => Duration(seconds: _retryAfterMaxS);

  /// Longest wait between retries of an unsent message / upload.
  static int get outboxRetryMaxS => _outboxRetryMaxS;

  static int get reconnectMinMs => _reconnectMinMs;
  static int get reconnectMaxMs =>
      _reconnectMaxMs < _reconnectMinMs ? _reconnectMinMs : _reconnectMaxMs;

  /// Server kill switch of the usage events (on top of the user's consent
  /// and the `app_events` flag).
  static bool get eventsEnabled => _eventsEnabled;
  static Duration get eventsFlush => Duration(seconds: _eventsFlushS);
  static Duration get callSync => Duration(seconds: _callSyncS);
  static Duration get qrPoll => Duration(seconds: _qrPollS);
  static Duration get resumeMinAway => Duration(seconds: _resumeMinAwayS);

  /// Reels warmed ahead of the one on screen (`client.video_prefetch_ahead`).
  static int get videoPrefetchAhead => _videoPrefetchAhead;

  /// Reel warm-up switch (`client.video_prefetch_mode`): `off` | `on` |
  /// `auto` (unmetered link only; the default). Anything else means auto.
  static String get videoPrefetchMode => _videoPrefetchMode;

  /// Longest side / JPEG quality of a photo sent in a chat
  /// (`media.chat_photo_*`; the original stays on the phone).
  static double get chatPhotoMaxPx => _chatPhotoMaxPx;
  static int get chatPhotoQuality => _chatPhotoQuality;

  /// The 1, 2, 4 … wait of retry number [failures] (1-based), at most
  /// [outboxRetryMaxS] seconds. One rule for the chat outbox, the upload
  /// queue and the storage uploader.
  static Duration outboxBackoff(int failures) {
    final s = 1 << (failures - 1).clamp(0, 9);
    return Duration(seconds: s > _outboxRetryMaxS ? _outboxRetryMaxS : s);
  }

  /// Called with the `app_config` of every bootstrap answer.
  static void apply(Map<String, String> config) {
    int pick(String key, int fallback, int min, int max) {
      final v = num.tryParse(config[key] ?? '')?.toInt();
      return (v ?? fallback).clamp(min, max);
    }

    _retryMax = pick('client.retry_max', 2, 0, 4);
    _retryBaseMs = pick('client.retry_base_ms', 1000, 200, 30000);
    _retryAfterMaxS = pick('client.retry_after_max_s', 10, 1, 120);
    _outboxRetryMaxS = pick('client.outbox_retry_max_s', 30, 5, 600);
    _reconnectMinMs =
        pick('client.realtime_reconnect_min_ms', 1000, 500, 60000);
    _reconnectMaxMs =
        pick('client.realtime_reconnect_max_ms', 10000, 2000, 300000);
    _eventsEnabled = config['client.events_enabled'] != 'false';
    _eventsFlushS = pick('client.events_flush_s', 60, 15, 3600);
    _callSyncS = pick('client.call_sync_s', 30, 10, 300);
    _qrPollS = pick('client.qr_poll_s', 10, 5, 60);
    _resumeMinAwayS = pick('client.resume_refresh_min_away_s', 30, 5, 3600);
    _videoPrefetchAhead = pick('client.video_prefetch_ahead', 3, 0, 6);
    final mode = config['client.video_prefetch_mode']?.trim().toLowerCase();
    _videoPrefetchMode = switch (mode) {
      'off' => 'off',
      'on' => 'on',
      _ => 'auto',
    };
    _chatPhotoMaxPx =
        pick('media.chat_photo_max_px', 1600, 640, 4096).toDouble();
    _chatPhotoQuality = pick('media.chat_photo_quality', 82, 50, 100);
  }

  /// Back to the starter values (tests).
  static void reset() => apply(const {});
}
