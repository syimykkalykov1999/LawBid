import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/video_cache/video_cache.dart';
import 'package:lawbid/core/persistence/drift_web.dart' show isFlutterTest;
import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/core/persistence/storage_compaction.dart';

/// What the phone's caches take, by store (plan §5.2: the ring and the
/// rows of «Данные и память»).
@immutable
class CacheReport {
  const CacheReport({required this.measuredAt, this.bytes = const {}});

  final Map<CacheStore, int> bytes;
  final DateTime measuredAt;

  int of(CacheStore s) => bytes[s] ?? 0;

  int get total => bytes.values.fold(0, (a, b) => a + b);

  CacheReport zeroed(Iterable<CacheStore> stores) => CacheReport(
        bytes: {...bytes, for (final s in stores) s: 0},
        measuredAt: measuredAt,
      );
}

/// Owner 2026-10-22 (client economy plan §5): measures and empties the
/// phone's caches. The outbox (unsent messages) is never touched.
class CacheMaintenance {
  CacheMaintenance({
    required CacheDatabase db,
    required SavedPageStore? pages,
    required CacheLimits Function() limits,
    HttpCacheInterceptor? http,
    MediaCacheDir? images,
    MediaCacheDir? chatMedia,
    MediaCacheDir? video,
    PrefixedTempFiles? voiceNotes,
  })  : _db = db,
        _pages = pages,
        _limits = limits,
        _http = http,
        _images = images ?? const MediaCacheDir(AppImageCaches.feedKey),
        _chatMedia =
            chatMedia ?? const MediaCacheDir(AppImageCaches.chatMediaKey),
        _video = video ?? const MediaCacheDir(VideoCache.folderName),
        _voiceNotes = voiceNotes ??
            const PrefixedTempFiles('voice_cache_', suffix: '.m4a');

  final CacheDatabase _db;
  final SavedPageStore? _pages;
  final CacheLimits Function() _limits;
  final HttpCacheInterceptor? _http;
  final MediaCacheDir _images;
  final MediaCacheDir _chatMedia;
  final MediaCacheDir _video;
  final PrefixedTempFiles _voiceNotes;

  /// Every store's size; a store that cannot be measured counts as 0.
  Future<CacheReport> measure() async {
    Future<int> guard(Future<int> Function() f) async {
      try {
        return await f();
      } on Object catch (e) {
        debugPrint('cache size: $e');
        return 0;
      }
    }

    final results = await Future.wait<int>([
      guard(_db.httpBytes),
      guard(_db.messagesBytes),
      guard(() => _pages?.pagesBytes() ?? Future.value(0)),
      guard(_images.size),
      guard(() async {
        final sizes =
            await Future.wait([_chatMedia.size(), _voiceNotes.size()]);
        return sizes[0] + sizes[1];
      }),
      guard(
        () async => await _db.translationsBytes() + await _db.fileViewsBytes(),
      ),
      guard(_video.size),
    ]);
    return CacheReport(
      bytes: {
        CacheStore.http: results[0],
        CacheStore.messages: results[1],
        CacheStore.feed: results[2],
        CacheStore.images: results[3],
        CacheStore.chatMedia: results[4],
        CacheStore.other: results[5],
        CacheStore.video: results[6],
      },
      measuredAt: DateTime.now(),
    );
  }

  /// Empties one store («Очистить» on its row). What is gone is fetched
  /// again when it is needed.
  /// False when a store could not be emptied (the video proxy did not
  /// answer): the caller must not show it as cleared.
  Future<bool> clear(CacheStore store) async {
    switch (store) {
      case CacheStore.http:
        // The memory level and the table (the interceptor's disk level is
        // the same table; a test interceptor has none).
        await _http?.clear(disk: false);
        await _db.clearHttp();
      case CacheStore.messages:
        await _db.clearMessages();
      case CacheStore.feed:
        await _pages?.clearPages();
      case CacheStore.images:
        await _images.clear();
        if (!isFlutterTest) await AppImageCaches.feed.emptyCache();
      case CacheStore.chatMedia:
        await _chatMedia.clear();
        await _voiceNotes.clear();
        if (!isFlutterTest) await AppImageCaches.chatMedia.emptyCache();
        await _db.forgetAllChatMedia();
      case CacheStore.video:
        // The video chunk cache (reels and chat videos). A running proxy
        // owns the folder and empties it itself; without one its files
        // are removed here (the folder stays).
        // A proxy that is still starting must come up first, or the files
        // would go out from under its first write.
        await VideoCache.settled();
        if (VideoCache.running) return VideoCache.clear();
        await _video.clearContents();
      case CacheStore.other:
        await _db.clearOther();
      case CacheStore.files:
        // No cache of their own on the phone yet.
        break;
    }
    return true;
  }

  /// «Очистить кэш» — everything except the outbox and the settings.
  /// False when some store could not be emptied.
  Future<bool> clearAll() async {
    var all = true;
    for (final s in CacheStore.values) {
      try {
        all = await clear(s) && all;
      } on Object catch (e) {
        all = false;
        debugPrint('cache clear ${s.name}: $e');
      }
    }
    return all;
  }

  /// Applies the limits and «Хранить медиа» (run once a day and when the
  /// settings change): oldest media out past the byte limit or the age.
  Future<void> enforce() async {
    // One pass at a time (start, daily timer and the write burst may meet).
    if (_enforcing) return;
    _enforcing = true;
    try {
      final l = _limits();
      await _images.trimTo(l.limitBytes(CacheStore.images));
      // Pictures and voice notes are one store («Медиа чатов»): one limit,
      // the least recently changed file goes first whichever it is.
      await trimPoolTo(
        [_chatMedia, _voiceNotes],
        l.limitBytes(CacheStore.chatMedia),
      );
      if (l.keepMediaDays > 0) {
        await _chatMedia.dropOlderThan(Duration(days: l.keepMediaDays));
        await _voiceNotes.dropOlderThan(Duration(days: l.keepMediaDays));
      }
      // The video proxy trims itself while it runs (the user's lower limit
      // is handed to it); a folder nobody writes to is trimmed here, after a
      // proxy that is still starting is up.
      VideoCache.limitTo(l.userLimitBytes(CacheStore.video));
      await VideoCache.settled();
      if (!VideoCache.running) await _video.trimTo(VideoCache.maxBytes);
      await _db.trimHttp(l.limitBytes(CacheStore.http));
      await _db.trimMessages(l.limitBytes(CacheStore.messages));
      // Owner 2026-10-24: the view lists of case documents live in «Прочее»
      // and may take at most a fifth of its limit.
      await _db.trimFileViews(l.limitBytes(CacheStore.other) ~/ 5);
      // S15-9: the trimmed rows' pages go back to the OS; the log is folded
      // in at most once a day.
      await _db.incrementalVacuum();
      final now = DateTime.now();
      final last = _lastCheckpoint;
      if (last == null || now.difference(last) >= _checkpointEvery) {
        _lastCheckpoint = now;
        await _db.checkpointWal();
      }
    } on Object catch (e) {
      debugPrint('cache enforce: $e');
    } finally {
      _enforcing = false;
    }
  }

  bool _enforcing = false;
  static const _checkpointEvery = Duration(hours: 20);
  static DateTime? _lastCheckpoint;

  /// Test hook: forget the daily checkpoint.
  @visibleForTesting
  static void resetCheckpointClock() => _lastCheckpoint = null;
}
