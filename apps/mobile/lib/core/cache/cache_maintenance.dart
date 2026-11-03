import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_eviction.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/video_cache/video_cache.dart';
import 'package:lawbid/core/persistence/drift_web.dart' show isFlutterTest;
import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/core/persistence/storage_compaction.dart';

/// Owner 2026-11-03 (Telegram «Использование памяти»): the four slices of
/// the ring and the rows with checkboxes. Stores map onto them: video;
/// photos (pictures and chat media); documents (the case-file views and
/// the files store); everything else (messages, requests, feed, the rest).
enum StorageCategory { video, photos, documents, other }

/// What the phone's caches take, by store (plan §5.2: the ring and the
/// rows of «Данные и память»).
@immutable
class CacheReport {
  const CacheReport({
    required this.measuredAt,
    this.bytes = const {},
    this.documents = 0,
  });

  final Map<CacheStore, int> bytes;
  final DateTime measuredAt;

  /// The part of [CacheStore.other] that is case-file views.
  final int documents;

  int of(CacheStore s) => bytes[s] ?? 0;

  int get total => bytes.values.fold(0, (a, b) => a + b);

  int ofCategory(StorageCategory c) => switch (c) {
        StorageCategory.video => of(CacheStore.video),
        StorageCategory.photos =>
          of(CacheStore.images) + of(CacheStore.chatMedia),
        StorageCategory.documents => documents + of(CacheStore.files),
        StorageCategory.other => of(CacheStore.http) +
            of(CacheStore.messages) +
            of(CacheStore.feed) +
            (of(CacheStore.other) - documents).clamp(0, 1 << 62),
      };

  CacheReport zeroed(Iterable<CacheStore> stores) => CacheReport(
        bytes: {...bytes, for (final s in stores) s: 0},
        measuredAt: measuredAt,
        documents: stores.contains(CacheStore.other) ? 0 : documents,
      );

  /// The sizes right after «Очистить» of [categories] (before the disk is
  /// measured again).
  CacheReport zeroedCategories(Set<StorageCategory> categories) {
    final next = {...bytes};
    var docs = documents;
    if (categories.contains(StorageCategory.video)) next[CacheStore.video] = 0;
    if (categories.contains(StorageCategory.photos)) {
      next[CacheStore.images] = 0;
      next[CacheStore.chatMedia] = 0;
    }
    if (categories.contains(StorageCategory.documents)) {
      next[CacheStore.files] = 0;
      next[CacheStore.other] = of(CacheStore.other) - docs;
      docs = 0;
    }
    if (categories.contains(StorageCategory.other)) {
      next[CacheStore.http] = 0;
      next[CacheStore.messages] = 0;
      next[CacheStore.feed] = 0;
      next[CacheStore.other] = docs;
    }
    return CacheReport(bytes: next, measuredAt: measuredAt, documents: docs);
  }
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
    Future<Set<String>> Function()? groupChatPaths,
  })  : _db = db,
        _groupChatPaths = groupChatPaths,
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

  /// The canonical paths of the chat-media files that belong to GROUP chats
  /// (the chat → picture index). Every other chat file is personal or not
  /// known, and never aged out by the groups' rule.
  final Future<Set<String>> Function()? _groupChatPaths;

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
        final sizes = await Future.wait([
          _chatMedia.size(),
          _voiceNotes.size(),
        ]);
        return sizes[0] + sizes[1];
      }),
      guard(
        () async => await _db.translationsBytes() + await _db.fileViewsBytes(),
      ),
      guard(_video.size),
      guard(_db.fileViewsBytes),
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
      documents: results[7],
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

  /// «Очистить» of the ticked categories of the ring. All four = [clearAll].
  /// False when something could not be emptied.
  Future<bool> clearCategories(Set<StorageCategory> categories) async {
    if (categories.length == StorageCategory.values.length) return clearAll();
    Future<bool> one(Future<bool> Function() f) async {
      try {
        return await f();
      } on Object catch (e) {
        debugPrint('cache clear category: $e');
        return false;
      }
    }

    Future<bool> store(CacheStore s) => one(() => clear(s));
    final jobs = <Future<bool>>[
      if (categories.contains(StorageCategory.video)) store(CacheStore.video),
      if (categories.contains(StorageCategory.photos)) ...[
        store(CacheStore.images),
        store(CacheStore.chatMedia),
      ],
      if (categories.contains(StorageCategory.documents))
        one(() async {
          await _db.clearFileViews();
          return true;
        }),
      if (categories.contains(StorageCategory.other)) ...[
        store(CacheStore.http),
        store(CacheStore.messages),
        store(CacheStore.feed),
        one(() async {
          await _db.clearOther(
            keepFileViews: !categories.contains(StorageCategory.documents),
          );
          return true;
        }),
      ],
    ];
    return !(await Future.wait(jobs)).contains(false);
  }

  /// «Очистить кэш» — everything except the outbox and the settings.
  /// False when some store could not be emptied.
  Future<bool> clearAll() async {
    // The video store may wait for a starting proxy (up to 10 s): it runs
    // alongside the others instead of in front of them.
    Future<bool> one(CacheStore s) async {
      try {
        return await clear(s);
      } on Object catch (e) {
        debugPrint('cache clear ${s.name}: $e');
        return false;
      }
    }

    final results = await Future.wait([
      for (final s in CacheStore.values) one(s),
    ]);
    return !results.contains(false);
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
      // the least recently used file goes first whichever it is.
      await trimPoolTo(
        [
          _chatMedia,
          _voiceNotes,
        ],
        l.limitBytes(CacheStore.chatMedia),
      );
      // Video files belong to the proxy, which evicts to the limit itself
      // (at its start and on these commands): never deleted from here, or a
      // starting proxy would find its chunks gone.
      // The admin's own video ceiling when there is one, else the user's cap
      // (video is kept to the cap by the proxy and by the global trim).
      VideoCache.limitTo(
        l.limitMb(CacheStore.video) > 0
            ? l.limitBytes(CacheStore.video)
            : l.capBytes ?? CacheLimits.unboundedBytes,
      );
      await _autoDelete(l);
      await _enforceCap(l);
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

  /// «Автоудаление закэшированных медиа»: what was not opened for the
  /// scope's age goes. Personal chats (and voice notes) / groups (the other
  /// chat files) / the feed (pictures and video chunks).
  Future<void> _autoDelete(CacheLimits l) async {
    final personal = l.autoDeleteDays(AutoDeleteScope.privateChats);
    final groups = l.autoDeleteDays(AutoDeleteScope.groups);
    if (personal > 0 || groups > 0) {
      final chat = await _chatMedia.entries();
      final group = await _groupChatPaths?.call() ?? const <String>{};
      bool isPersonal(CachedFile f) =>
          !group.contains(canonicalPath(f.$1.path));
      final now = DateTime.now();
      Future<void> sweep(Iterable<CachedFile> files, int days) async {
        if (days <= 0) return;
        final cutoff = now.subtract(Duration(days: days));
        await _delete([
          for (final f in files)
            if (f.$2.isBefore(cutoff)) f.$1,
        ]);
      }

      await sweep(
        [
          ...chat.where(isPersonal),
          ...await _voiceNotes.entries(),
        ],
        personal,
      );
      await sweep(chat.where((f) => !isPersonal(f)), groups);
    }
    final feed = l.autoDeleteDays(AutoDeleteScope.feed);
    if (feed > 0) {
      await _images.dropOlderThan(Duration(days: feed));
      VideoCache.dropOlderThan(Duration(days: feed));
    }
  }

  /// «Максимальный размер кэша»: when pictures, chat media, voice notes and
  /// video chunks together pass the cap, the least recently used go first.
  Future<void> _enforceCap(CacheLimits l) async {
    final cap = l.capBytes;
    if (cap == null) return;
    final entries = <EvictionEntry>[];
    Future<void> collect(String pool, CachedFiles source) async {
      for (final (file, used, bytes) in await source.entries()) {
        entries.add(
          EvictionEntry(pool: pool, lastUsed: used, bytes: bytes, ref: file),
        );
      }
    }

    await collect('images', _images);
    await collect('chat', _chatMedia);
    await collect('voice', _voiceNotes);
    await collect('video', _video);
    final victims = planCapEviction(entries, cap);
    if (victims.isEmpty) return;
    await _delete([
      for (final v in victims)
        if (v.pool != 'video') v.ref! as File,
    ]);
    // The proxy drops its own oldest chunks down to what is left.
    final videoTotal = entries
        .where((e) => e.pool == 'video')
        .fold<int>(0, (a, e) => a + e.bytes);
    final videoFreed = victims
        .where((e) => e.pool == 'video')
        .fold<int>(0, (a, e) => a + e.bytes);
    if (videoFreed > 0) VideoCache.trimTo(videoTotal - videoFreed);
  }

  Future<void> _delete(Iterable<File> files) async {
    for (final f in files) {
      try {
        await f.delete();
      } on Object {
        // Busy or gone: the next pass tries again.
      }
    }
  }

  bool _enforcing = false;
  static const _checkpointEvery = Duration(hours: 20);
  static DateTime? _lastCheckpoint;

  /// Test hook: forget the daily checkpoint.
  @visibleForTesting
  static void resetCheckpointClock() => _lastCheckpoint = null;
}
