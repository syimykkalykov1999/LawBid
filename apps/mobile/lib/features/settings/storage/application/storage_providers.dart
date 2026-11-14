import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_maintenance.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/camera_shots.dart';
import 'package:lawbid/core/cache/chat_media_providers.dart';
import 'package:lawbid/core/cache/voice_web_cache.dart';
import 'package:lawbid/core/cache/web_storage.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/persistence/large_value_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/startup_idle_queue.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart'
    show casesLocalDatabaseProvider;
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialLocalDatabaseProvider;

export 'package:lawbid/core/cache/cache_limits.dart';
export 'package:lawbid/core/cache/cache_maintenance.dart';

/// Owner 2026-10-22 (client economy plan §5.2): the one object that
/// measures and empties the phone's caches for «Данные и память».
final cacheMaintenanceProvider = Provider<CacheMaintenance>((ref) {
  final limits = ref.watch(cacheLimitsProvider);
  // The picture manager's own stale period: as long as the longest chat age
  // (always as soon as one chat scope is «Никогда»); the sweeps by scope
  // are CacheMaintenance.enforce.
  final personal = limits.autoDeleteDays(AutoDeleteScope.privateChats);
  final groups = limits.autoDeleteDays(AutoDeleteScope.groups);
  AppImageCaches.configure(
    keepChatMediaDays: personal <= 0 || groups <= 0
        ? 0
        : (personal > groups ? personal : groups),
  );
  return CacheMaintenance(
    db: ref.watch(cacheDatabaseProvider),
    // B-c2 (e): on the site, its own Cache Storage and the browser's quota.
    web: WebCaches.forPlatform(),
    pages: ref.watch(socialLocalDatabaseProvider),
    limits: () => ref.read(cacheLimitsProvider),
    http: ref.watch(httpCacheInterceptorProvider),
    voiceWeb: kIsWeb ? ref.watch(voiceWebCacheProvider) : null,
    groupChatPaths: ref.watch(chatMediaIndexProvider).groupFilePaths,
  );
});

/// The sizes on the screen: measured when it opens, zeroed at once after
/// «Очистить» (the disk is already being emptied), measured again after.
class CacheReportNotifier extends AsyncNotifier<CacheReport> {
  @override
  Future<CacheReport> build() => ref.watch(cacheMaintenanceProvider).measure();

  /// False when the store was not emptied: the sizes are measured again
  /// at once instead of staying at the optimistic zero.
  Future<bool> clear(CacheStore store) async {
    final before = state.value;
    if (before != null) state = AsyncData(before.zeroed([store]));
    final ok = await ref.read(cacheMaintenanceProvider).clear(store);
    unawaited(_remeasure());
    return ok;
  }

  /// The ticked categories of the ring («Очистить выбранное»).
  Future<bool> clearCategories(Set<StorageCategory> categories) async {
    final before = state.value;
    if (before != null) state = AsyncData(before.zeroedCategories(categories));
    final ok =
        await ref.read(cacheMaintenanceProvider).clearCategories(categories);
    unawaited(_remeasure());
    return ok;
  }

  Future<bool> clearAll() async {
    final before = state.value;
    if (before != null) state = AsyncData(before.zeroed(CacheStore.values));
    final ok = await ref.read(cacheMaintenanceProvider).clearAll();
    unawaited(_remeasure());
    return ok;
  }

  Future<void> _remeasure() async {
    try {
      final fresh = await ref.read(cacheMaintenanceProvider).measure();
      if (ref.mounted) state = AsyncData(fresh);
    } on Object {
      // Keep the zeros shown.
    }
  }
}

/// Owner 2026-11-05: everything an account kept on the phone leaves with it,
/// whichever way it ended (sign-out, a dead session, another person signing
/// in). One pass at a time: a quick sign-in never meets a wipe still running.
/// The device's own settings stay (see `personalKeys`).
final accountFilesGuardProvider = Provider<void>((ref) {
  var last = Future<void>.value();

  /// Unsent work and queued files, of everyone but [keeping].
  Future<void> forgetWork(String? keeping) async {
    final social = ref.read(socialLocalDatabaseProvider);
    await social.forgetOutboxOfOthers(keeping: keeping);
    await social.forgetRecentOfOthers(keeping: keeping);
    await ref
        .read(casesLocalDatabaseProvider)
        .forgetDraftsOfOthers(keeping: keeping);
    final uploads = ref.read(uploadQueueDatabaseProvider);
    final files = ref.read(uploadFilesProvider);
    for (final job in await uploads.ofOthers(keeping: keeping)) {
      final name = job.fileName;
      if (name != null) await files.remove(name);
      await uploads.remove(job.id);
    }
  }

  Future<bool> wipe(String? keepOwner) async {
    final kv = ref.read(localKvStoreProvider);
    // Each part runs whatever happened to the one before it.
    var done = true;
    Future<void> part(Future<void> Function() f) async {
      try {
        await f();
      } on Object catch (e) {
        debugPrint('account data: $e');
        done = false;
      }
    }

    await part(
      () => ref.read(deviceTracesCleanerProvider)(
        signedOut: keepOwner == null,
      ),
    );
    await part(() => forgetWork(keepOwner));
    await part(
      () => kv.removeWhere((k) => isForeignAccountKey(k, keepOwner)),
    );
    // D1-16: the big values (contact-book hashes) live in their own store.
    await part(
      () => ref
          .read(largeValueStoreProvider)
          .removeWhere((k) => isForeignAccountKey(k, keepOwner)),
    );
    final cleared = await ref
        .read(cacheMaintenanceProvider)
        .clearAccountData(keepOwner: keepOwner);
    return done && cleared;
  }

  // What a pass already under way wrote after the wipe.
  Future<void> forgetOthers(String owner) async {
    await forgetWork(owner);
    await ref
        .read(localKvStoreProvider)
        .removeWhere((k) => isOtherAccountKey(k, owner));
    await ref
        .read(largeValueStoreProvider)
        .removeWhere((k) => isOtherAccountKey(k, owner));
  }

  ref.listen(
    sessionControllerProvider.select((s) => s?.sub),
    (previous, next) {
      last = last.then((_) async {
        try {
          await wipeAccountDataIfChanged(
            previous: previous,
            next: next,
            kv: ref.read(localKvStoreProvider),
            wipe: wipe,
            forgetOthers: forgetOthers,
          );
        } on Object catch (e) {
          debugPrint('account data: $e');
        }
      });
    },
  );
});

final cacheReportProvider =
    AsyncNotifierProvider.autoDispose<CacheReportNotifier, CacheReport>(
  CacheReportNotifier.new,
);

/// Once a day in the background (and after the settings change): the
/// limits and «Хранить медиа» are applied to what is on the phone.
final cacheEnforcerProvider = Provider<void>((ref) {
  final maintenance = ref.watch(cacheMaintenanceProvider);
  // Perf batch 4 (row 127): the first pass waits for the first screens
  // (directory scans, trims and a vacuum used to run during the splash).
  final first = Timer(
    StartupDelays.cacheEnforce,
    () => unawaited(maintenance.enforce()),
  );
  // D1-44: camera temp shots an app kill left behind (ID photos, selfies);
  // a day old, so a shot another screen still holds is not touched.
  unawaited(sweepCameraShots(olderThan: const Duration(days: 1)));
  final timer = Timer.periodic(
    const Duration(hours: 24),
    (_) => unawaited(maintenance.enforce()),
  );
  // Caching round 2 (S2-11): also after every N downloaded pictures, not
  // only at start and once a day.
  AppImageCaches.onWriteBurst = () => unawaited(maintenance.enforce());
  ref.onDispose(() {
    first.cancel();
    timer.cancel();
    AppImageCaches.onWriteBurst = null;
  });
});
