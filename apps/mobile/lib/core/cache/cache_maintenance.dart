import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
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
  })  : _db = db,
        _pages = pages,
        _limits = limits,
        _http = http,
        _images = images ?? const MediaCacheDir(AppImageCaches.feedKey),
        _chatMedia =
            chatMedia ?? const MediaCacheDir(AppImageCaches.chatMediaKey);

  final CacheDatabase _db;
  final SavedPageStore? _pages;
  final CacheLimits Function() _limits;
  final HttpCacheInterceptor? _http;
  final MediaCacheDir _images;
  final MediaCacheDir _chatMedia;

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
      guard(_chatMedia.size),
      guard(
        () async => await _db.translationsBytes() + await _db.fileViewsBytes(),
      ),
    ]);
    return CacheReport(
      bytes: {
        CacheStore.http: results[0],
        CacheStore.messages: results[1],
        CacheStore.feed: results[2],
        CacheStore.images: results[3],
        CacheStore.chatMedia: results[4],
        CacheStore.other: results[5],
      },
      measuredAt: DateTime.now(),
    );
  }

  /// Empties one store («Очистить» on its row). What is gone is fetched
  /// again when it is needed.
  Future<void> clear(CacheStore store) async {
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
        if (!isFlutterTest) await AppImageCaches.chatMedia.emptyCache();
      case CacheStore.other:
        await _db.clearOther();
      case CacheStore.files:
      case CacheStore.video:
        // No cache of their own on the phone yet.
        break;
    }
  }

  /// «Очистить кэш» — everything except the outbox and the settings.
  Future<void> clearAll() async {
    for (final s in CacheStore.values) {
      try {
        await clear(s);
      } on Object catch (e) {
        debugPrint('cache clear ${s.name}: $e');
      }
    }
  }

  /// Applies the limits and «Хранить медиа» (run once a day and when the
  /// settings change): oldest media out past the byte limit or the age.
  Future<void> enforce() async {
    final l = _limits();
    try {
      await _images.trimTo(l.limitBytes(CacheStore.images));
      await _chatMedia.trimTo(l.limitBytes(CacheStore.chatMedia));
      if (l.keepMediaDays > 0) {
        await _chatMedia.dropOlderThan(Duration(days: l.keepMediaDays));
      }
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
    }
  }

  static const _checkpointEvery = Duration(hours: 20);
  static DateTime? _lastCheckpoint;

  /// Test hook: forget the daily checkpoint.
  @visibleForTesting
  static void resetCheckpointClock() => _lastCheckpoint = null;
}
