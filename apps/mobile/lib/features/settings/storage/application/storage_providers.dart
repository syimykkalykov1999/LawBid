import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_maintenance.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialLocalDatabaseProvider;

export 'package:lawbid/core/cache/cache_limits.dart';
export 'package:lawbid/core/cache/cache_maintenance.dart';

/// Owner 2026-10-22 (client economy plan §5.2): the one object that
/// measures and empties the phone's caches for «Данные и память».
final cacheMaintenanceProvider = Provider<CacheMaintenance>((ref) {
  AppImageCaches.configure(
    keepChatMediaDays: ref.watch(cacheLimitsProvider).keepMediaDays,
  );
  return CacheMaintenance(
    db: ref.watch(cacheDatabaseProvider),
    pages: ref.watch(socialLocalDatabaseProvider),
    limits: () => ref.read(cacheLimitsProvider),
    http: ref.watch(httpCacheInterceptorProvider),
  );
});

/// The sizes on the screen: measured when it opens, zeroed at once after
/// «Очистить» (the disk is already being emptied), measured again after.
class CacheReportNotifier extends AsyncNotifier<CacheReport> {
  @override
  Future<CacheReport> build() => ref.watch(cacheMaintenanceProvider).measure();

  Future<void> clear(CacheStore store) async {
    final before = state.value;
    if (before != null) state = AsyncData(before.zeroed([store]));
    await ref.read(cacheMaintenanceProvider).clear(store);
    unawaited(_remeasure());
  }

  Future<void> clearAll() async {
    final before = state.value;
    if (before != null) state = AsyncData(before.zeroed(CacheStore.values));
    await ref.read(cacheMaintenanceProvider).clearAll();
    unawaited(_remeasure());
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

final cacheReportProvider =
    AsyncNotifierProvider.autoDispose<CacheReportNotifier, CacheReport>(
  CacheReportNotifier.new,
);

/// Once a day in the background (and after the settings change): the
/// limits and «Хранить медиа» are applied to what is on the phone.
final cacheEnforcerProvider = Provider<void>((ref) {
  final maintenance = ref.watch(cacheMaintenanceProvider);
  unawaited(maintenance.enforce());
  final timer = Timer.periodic(
    const Duration(hours: 24),
    (_) => unawaited(maintenance.enforce()),
  );
  // Caching round 2 (S2-11): also after every N downloaded pictures, not
  // only at start and once a day.
  AppImageCaches.onWriteBurst = () => unawaited(maintenance.enforce());
  ref.onDispose(() {
    timer.cancel();
    AppImageCaches.onWriteBurst = null;
  });
});
