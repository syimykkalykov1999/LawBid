import 'dart:math';

import 'package:lawbid/core/network/request_priority.dart';

/// Scale audit 2026-10-23: the knobs of the phone's own traffic (repeats of
/// a failed request, polling, usage
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
  static int _fastTimeoutS = 8;
  static int _retryMax = 2;
  static int _retryBaseMs = 1000;
  static int _retryAfterMaxS = 10;
  static int _outboxRetryMaxS = 30;
  static bool _eventsEnabled = true;
  static int _eventsFlushS = 60;
  static int _callSyncS = 30;
  static int _callEndedMs = 1600;
  static int _callEndedHoldS = 0;
  static int _qrPollS = 10;
  static int _resumeMinAwayS = 30;
  static int _loadAheadPercent = 100;
  static int _feedLoadAheadPercent = 200;
  static int _loadAheadRows = 8;
  static int _mediaPrefetchAhead = 3;
  static int _undoWindowS = 5;
  static int _chatSearchDebounceMs = 300;
  static int _notInterestedKeepDays = 90;
  static int _videoPrefetchAhead = 3;
  static int _videoPrefetchCellular = 1;
  static int _videoCacheMb = 100;
  static int _uploadsAtOnce = 4;
  static bool _partsAuto = true;
  static int _partsMax = 8;
  static int _partsMin = 2;
  static int _downloadsAtOnce = 4;
  static int _scanPollSocketMs = 3000;
  static double _verificationPhotoMaxPx = 2048;
  static int _verificationPhotoQuality = 90;

  /// Whether a bootstrap answer (or [reset]) has set the numbers yet.
  static bool applied = false;

  static int _videoCacheChunkS = 4;

  /// Set by the connectivity monitor: true while the only way online is
  /// mobile data (S20-9). Reset by [reset].
  static bool metered = false;

  /// R-256 (flag `low_power_mode`): little charge left or the phone's battery
  /// saver is on (core/config/low_power.dart). Reset by [reset].
  static bool lowPower = false;

  /// Set when a big transfer starts: a phone with little memory
  /// (core/transfers/transfer_limits.dart). Reset by [reset].
  static bool weakDevice = false;

  /// Flag `downloads_parallel`, set with every bootstrap answer.
  static bool downloadsParallel = false;

  /// Flag `video_cache_parallel`, set with every bootstrap answer.
  static bool videoCacheParallel = false;

  static double _chatPhotoMaxPx = 1600;
  static int _chatPhotoQuality = 82;
  static int _pickedImageReadX = 4;
  static int _sentryTracesPercent = 0;
  static int _traceparentPercent = 5;

  /// S15-12: receive timeout of the latency-critical reads (the start's
  /// `GET /me/session` and `/config/bootstrap`) instead of the 15 s every
  /// other call gets: a bad network or a captive portal gives its verdict
  /// sooner (`client.fast_timeout_s`). Never used for writes.
  static Duration get fastTimeout => Duration(seconds: _fastTimeoutS);

  /// Repeats of a failed safe request (RetryInterceptor).
  static int get retryMax => _retryMax;

  /// First wait before a repeat; doubles each time.
  static Duration get retryBase => Duration(milliseconds: _retryBaseMs);

  /// The longest `Retry-After` the app obeys.
  static Duration get retryAfterMax => Duration(seconds: _retryAfterMaxS);

  /// Longest wait between retries of an unsent message / upload.
  static int get outboxRetryMaxS => _outboxRetryMaxS;

  /// Stage 2 SRE (Б5): the retry budget (gRFC A6 retry throttling,
  /// retry_budget.dart): tokens to start with and the share of a token an
  /// answered request gives back (`client.retry_tokens_max` /
  /// `client.retry_token_ratio`).
  static double get retryTokensMax => _retryTokensMax;
  static double get retryTokenRatio => _retryTokenRatio;

  /// Stage 2 SRE (Б5): client-side adaptive throttling of prefetch and
  /// background requests (SRE ch. 21): K (0 = off) and the window.
  static double get throttleK => _throttleK;
  static Duration get throttleWindow => Duration(seconds: _throttleWindowS);

  /// Stage 2 SRE (Б5): whether the app sends `X-Request-Timeout-Ms`.
  /// Phones: unless the admin switched it off. The website: only once the
  /// bootstrap of THIS server said it allows the header in CORS (an older
  /// API would fail the browser's preflight) — the same rule as
  /// `X-Request-Priority`.
  static bool deadlineHeaderAllowed({required bool web}) {
    final v = RequestPriority.lastConfig?['client.deadline_header_enabled'];
    if (v == 'false') return false;
    return !web || v == 'true';
  }

  static double _retryTokensMax = 10;
  static double _retryTokenRatio = 0.1;
  static double _throttleK = 2;
  static int _throttleWindowS = 120;

  /// Server kill switch of the usage events (on top of the user's consent
  /// and the `app_events` flag).
  static bool get eventsEnabled => _eventsEnabled;
  static Duration get eventsFlush => Duration(seconds: _eventsFlushS);
  static Duration get callSync => Duration(seconds: _callSyncS);

  /// Row 166: how long the short «Call ended» screen stays
  /// (`client.call_ended_ms`).
  static Duration get callEndedLinger => Duration(milliseconds: _callEndedMs);

  /// Row 166 (WhatsApp): how long «No answer» · Cancel · Call again waits
  /// for a tap (`client.call_ended_hold_s`); zero = until the person taps.
  static Duration get callEndedHold => Duration(seconds: _callEndedHoldS);
  static Duration get qrPoll => Duration(seconds: _qrPollS);
  static Duration get resumeMinAway => Duration(seconds: _resumeMinAwayS);

  /// Row 38 (Instagram / TikTok): lists ask for the next page while this
  /// many screens are still ahead (`client.load_ahead_percent` / 100).
  static double get loadAheadScreens => _loadAheadPercent / 100;

  /// The same for full-width card lists such as the feed
  /// (`client.feed_load_ahead_percent`).
  static double get feedLoadAheadScreens => _feedLoadAheadPercent / 100;

  /// Message threads ask for older messages this many rows before the
  /// oldest loaded one (`client.load_ahead_rows`).
  static int get loadAheadRows => _loadAheadRows;

  /// Pictures of this many next rows are warmed
  /// (`client.media_prefetch_ahead`).
  static int get mediaPrefetchAhead => _mediaPrefetchAhead;

  /// Row 109 (Telegram / Gmail): how long «Undo» stays after a delete,
  /// an archive or an unfollow (`client.undo_window_s`).
  static Duration get undoWindow => Duration(seconds: _undoWindowS);

  /// Row 110: the pause in typing before an in-chat or member search asks
  /// the server (`client.chat_search_debounce_ms`, 0 = at every key).
  static Duration get chatSearchDebounce =>
      Duration(milliseconds: _chatSearchDebounceMs);

  /// Row 112: posts marked «Not interested» stay hidden on this device for
  /// this many days (`client.not_interested_keep_days`).
  static Duration get notInterestedKeep =>
      Duration(days: _notInterestedKeepDays);

  /// Reels warmed ahead of the one on screen: `client.video_prefetch_ahead`
  /// on Wi-Fi, `client.video_prefetch_cellular` on mobile data (S20-9; the
  /// server already folded its Выкл/Вкл/Авто switch into the two numbers).
  /// R-256: none at all while the phone is low on power.
  static int get videoPrefetchAhead {
    if (lowPower) return 0;
    return metered && _videoPrefetchCellular < _videoPrefetchAhead
        ? _videoPrefetchCellular
        : _videoPrefetchAhead;
  }

  /// Disk ceiling of the video chunk cache, MB; 0 = off
  /// (`client.video_cache_mb`).
  static int get videoCacheMb => _videoCacheMb;

  /// R-251: pieces of files going up at once in the whole app
  /// (`client.uploads_at_once`); two on mobile data, a weak phone or
  /// low power.
  static int get uploadsAtOnce => _gentle(_uploadsAtOnce);

  /// Owner 2026-11-09: parts of uploads at once. Auto
  /// (`client.upload_parts_mode`): a file starts at [uploadPartsStart],
  /// climbs while the speed grows up to [uploadPartsCeiling]
  /// (`client.upload_parts_max`, 8) and falls to [uploadPartsFloor]
  /// (`client.upload_parts_min`, 2) after a failed or timed-out part. Mobile
  /// data is not capped: it starts at four like everywhere and the climb
  /// stays there when the link is full. A weak phone or low power: two at
  /// most. fixed: [uploadsAtOnce], as before.
  static int get uploadPartsCeiling =>
      _partsAuto ? _gentleDevice(_partsMax) : uploadsAtOnce;

  /// Where the parts of a new file start (the old fixed number).
  static int get uploadPartsStart => _partsAuto
      ? min(_gentleDevice(_uploadsAtOnce), uploadPartsCeiling)
      : uploadsAtOnce;

  /// The fewest parts at once after a failure.
  static int get uploadPartsFloor =>
      _partsAuto ? min(_partsMin, uploadPartsStart) : 1;

  static int _gentleDevice(int n) => (weakDevice || lowPower) && n > 2 ? 2 : n;

  /// R-251: pieces of files coming down at once in the whole app
  /// (`client.downloads_at_once`); two on mobile data, a weak phone or
  /// low power.
  static int get downloadsAtOnce => _gentle(_downloadsAtOnce);

  /// Owner row 106: while the realtime socket is connected the server pushes
  /// `file:ready`; the check of an upload is then asked only this often as a
  /// safety net (`client.scan_poll_socket_ms`) instead of every 700 ms.
  static Duration get scanPollWithSocket =>
      Duration(milliseconds: _scanPollSocketMs);

  /// Pieces one document download is cut into; 1 = the old single stream.
  static int get downloadPieces => downloadsParallel ? downloadsAtOnce : 1;

  /// Blocks of a video's start fetched at once; 1 = one after another.
  static int get videoBlocksAtOnce => videoCacheParallel ? downloadsAtOnce : 1;

  static int _gentle(int n) =>
      (metered || weakDevice || lowPower) && n > 2 ? 2 : n;

  /// Seconds from the start of a video kept on the phone
  /// (`client.video_cache_chunk_s`).
  static int get videoCacheChunkSeconds => _videoCacheChunkS;

  /// Longest side / JPEG quality of a photo sent in a chat
  /// (`media.chat_photo_*`; the original stays on the phone).
  static double get chatPhotoMaxPx => _chatPhotoMaxPx;
  static int get chatPhotoQuality => _chatPhotoQuality;

  /// Row 149: a photo picked from «Files» above the file limit is still read
  /// and shrunk, up to this many times the limit (`media.picked_image_read_x`,
  /// 0 = no cap), so a 2 GB "picture" is never read whole.
  static int get pickedImageReadX => _pickedImageReadX;

  /// Media audit 13.11 (C7): longest side / JPEG quality of a verification
  /// document photo picked from «Files» (`client.verification_photo_*`).
  static double get verificationPhotoMaxPx => _verificationPhotoMaxPx;
  static int get verificationPhotoQuality => _verificationPhotoQuality;

  /// Share of sessions (percent) whose performance trace goes to Sentry
  /// (`client.sentry_traces_percent`); 0 = off. Also needs the person's
  /// analytics consent (core/diagnostics/sentry_native.dart).
  static int get sentryTracesPercent => _sentryTracesPercent;

  /// Share of API calls (percent) sent with a W3C `traceparent` header
  /// (`client.traceparent_percent`); 0 = never.
  static int get traceparentPercent => _traceparentPercent;

  /// The 1, 2, 4 … wait of retry number [failures] (1-based), at most
  /// [outboxRetryMaxS] seconds. One rule for the chat outbox, the upload
  /// queue and the storage uploader.
  static Duration outboxBackoff(int failures) {
    final s = 1 << (failures - 1).clamp(0, 9);
    return Duration(seconds: s > _outboxRetryMaxS ? _outboxRetryMaxS : s);
  }

  /// [d] plus up to 30% random extra, so a fleet that failed together does
  /// not come back together. One rule for [outboxDelay] and the inline
  /// `RetryInterceptor` backoff.
  static Duration withJitter(Duration d, [Random? random]) {
    final extra =
        (d.inMilliseconds * 0.3 * (random ?? _rng).nextDouble()).round();
    return d + Duration(milliseconds: extra);
  }

  /// The server's `Retry-After` in whole seconds (an HTTP date is ignored)
  /// from the raw header values (Dio keeps a list, a proxy may send two:
  /// the first counts); null when absent or unparseable. Clamped to a day so
  /// an absurd number cannot overflow a [Duration].
  static Duration? parseRetryAfter(Iterable<String>? values) {
    final raw = values == null || values.isEmpty ? null : values.first;
    final secs = raw == null ? null : int.tryParse(raw.trim());
    if (secs == null || secs < 0) return null;
    return Duration(seconds: secs > 86400 ? 86400 : secs);
  }

  /// How long a piece of a big upload waits before it is sent again. On a
  /// 429 or 503 that carries `Retry-After` the server's number replaces
  /// [backoff], capped at [retryAfterMax] (as `RetryInterceptor` does for API
  /// calls); anything else keeps [backoff].
  static Duration partRetryWait(
    int? status,
    Iterable<String>? retryAfterHeader,
    Duration backoff,
  ) {
    if (status != 429 && status != 503) return backoff;
    final d = parseRetryAfter(retryAfterHeader);
    if (d == null) return backoff;
    return d > retryAfterMax ? retryAfterMax : d;
  }

  /// The longest `Retry-After` the outbox / upload queue waits out (the
  /// server may ask for more; a background queue does not sleep for hours).
  static const Duration queueRetryAfterMax = Duration(minutes: 2);

  /// The wait before retry number [failures] of the outbox / upload queue:
  /// [outboxBackoff] with up to 30% jitter (downwards once at the
  /// [outboxRetryMaxS] ceiling, so a long outage still spreads the clients
  /// instead of landing them all on the same second). A server's
  /// `Retry-After` ([retryAfter], at most [queueRetryAfterMax]) is a floor
  /// and gets the same jitter on top: clients told «5» do not all return at
  /// exactly 5.
  static Duration outboxDelay(
    int failures, {
    Duration? retryAfter,
    Random? random,
  }) {
    final cap = Duration(seconds: _outboxRetryMaxS);
    final base = outboxBackoff(failures);
    final extra = (random ?? _rng).nextDouble() * 0.3;
    var own = base + base * extra;
    if (own > cap) own = cap - base * extra;
    if (retryAfter == null) return own;
    final asked =
        retryAfter > queueRetryAfterMax ? queueRetryAfterMax : retryAfter;
    final askedJittered = withJitter(asked, random);
    return askedJittered > own ? askedJittered : own;
  }

  static final _rng = Random();

  /// Called with the `app_config` of every bootstrap answer.
  static void apply(Map<String, String> config) {
    applied = true;
    // Holes re-check (25.11, item 21): may this app send X-Request-Priority.
    RequestPriority.lastConfig = config;
    int pick(String key, int fallback, int min, int max) {
      final v = num.tryParse(config[key] ?? '')?.toInt();
      return (v ?? fallback).clamp(min, max);
    }

    _fastTimeoutS = pick('client.fast_timeout_s', 8, 3, 30);
    _retryMax = pick('client.retry_max', 2, 0, 4);
    _retryBaseMs = pick('client.retry_base_ms', 1000, 200, 30000);
    _retryAfterMaxS = pick('client.retry_after_max_s', 10, 1, 120);
    _outboxRetryMaxS = pick('client.outbox_retry_max_s', 30, 5, 600);
    double pickD(String key, double fallback, double min, double max) {
      final v = num.tryParse(config[key] ?? '')?.toDouble();
      return (v ?? fallback).clamp(min, max);
    }

    // Stage 2 SRE (Б5): same bounds as api client-tuning.ts.
    _retryTokensMax = pickD('client.retry_tokens_max', 10, 1, 1000);
    _retryTokenRatio = pickD('client.retry_token_ratio', 0.1, 0.01, 1);
    _throttleK = pickD('client.throttle_k', 2, 0, 10);
    _throttleWindowS = pick('client.throttle_window_s', 120, 10, 600);
    _eventsEnabled = config['client.events_enabled'] != 'false';
    _eventsFlushS = pick('client.events_flush_s', 60, 15, 3600);
    _callSyncS = pick('client.call_sync_s', 30, 10, 300);
    _callEndedMs = pick('client.call_ended_ms', 1600, 500, 10000);
    _callEndedHoldS = pick('client.call_ended_hold_s', 0, 0, 600);
    _qrPollS = pick('client.qr_poll_s', 10, 5, 60);
    _resumeMinAwayS = pick('client.resume_refresh_min_away_s', 30, 5, 3600);
    _loadAheadPercent = pick('client.load_ahead_percent', 100, 10, 1000);
    _feedLoadAheadPercent =
        pick('client.feed_load_ahead_percent', 200, 10, 1000);
    _loadAheadRows = pick('client.load_ahead_rows', 8, 1, 100);
    _mediaPrefetchAhead = pick('client.media_prefetch_ahead', 3, 0, 10);
    _undoWindowS = pick('client.undo_window_s', 5, 2, 30);
    _chatSearchDebounceMs =
        pick('client.chat_search_debounce_ms', 300, 0, 3000);
    _notInterestedKeepDays =
        pick('client.not_interested_keep_days', 90, 1, 3650);
    _videoPrefetchAhead = pick('client.video_prefetch_ahead', 3, 0, 6);
    _videoPrefetchCellular = pick('client.video_prefetch_cellular', 1, 0, 6);
    _videoCacheMb = pick('client.video_cache_mb', 100, 0, 1000);
    _videoCacheChunkS = pick('client.video_cache_chunk_s', 4, 1, 15);
    _uploadsAtOnce = pick('client.uploads_at_once', 4, 1, 4);
    _partsAuto = config['client.upload_parts_mode'] != 'fixed';
    _partsMax = pick('client.upload_parts_max', 8, 1, 16);
    _partsMin = pick('client.upload_parts_min', 2, 1, 8);
    _downloadsAtOnce = pick('client.downloads_at_once', 4, 1, 4);
    _scanPollSocketMs = pick('client.scan_poll_socket_ms', 3000, 500, 30000);
    _chatPhotoMaxPx = pick(
      'media.chat_photo_max_px',
      1600,
      640,
      4096,
    ).toDouble();
    _chatPhotoQuality = pick('media.chat_photo_quality', 82, 50, 100);
    _pickedImageReadX = pick('media.picked_image_read_x', 4, 0, 100);
    _verificationPhotoMaxPx = pick(
      'client.verification_photo_max_px',
      2048,
      1024,
      4096,
    ).toDouble();
    _verificationPhotoQuality =
        pick('client.verification_photo_quality', 90, 50, 100);
    _sentryTracesPercent = pick('client.sentry_traces_percent', 0, 0, 100);
    _traceparentPercent = pick('client.traceparent_percent', 5, 0, 100);
  }

  /// Back to the starter values (tests).
  static void reset() {
    metered = false;
    lowPower = false;
    weakDevice = false;
    downloadsParallel = false;
    videoCacheParallel = false;
    apply(const {});
  }
}
