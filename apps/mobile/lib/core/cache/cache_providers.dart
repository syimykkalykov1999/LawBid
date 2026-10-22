import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/network_usage.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/persistence/drift_web.dart' show isFlutterTest;
import 'package:lawbid/core/persistence/persistence_providers.dart';

/// The one cache database of the app (plan §5). Opened lazily on first use;
/// in tests override it with `CacheDatabase(NativeDatabase.memory())`.
final cacheDatabaseProvider = Provider<CacheDatabase>((ref) {
  final db = CacheDatabase();
  ref.onDispose(db.close);
  return db;
});

/// The user's own, lower cache limits and «Хранить медиа»
/// (SharedPreferences).
class CacheSettings extends Notifier<CacheSettingsState> {
  static const _limitPrefix = 'cache.user_limit_mb.';
  static const _keepKey = 'cache.keep_media_days';

  @override
  CacheSettingsState build() {
    final kv = ref.watch(localKvStoreProvider);
    final user = <CacheStore, int>{};
    for (final s in CacheStore.values) {
      final v = int.tryParse(kv.getString('$_limitPrefix${s.configKey}') ?? '');
      if (v != null && v > 0) user[s] = v;
    }
    return CacheSettingsState(
      userMb: user,
      keepMediaDays: int.tryParse(kv.getString(_keepKey) ?? ''),
    );
  }

  Future<void> setLimitMb(CacheStore store, int? mb) async {
    final kv = ref.read(localKvStoreProvider);
    final key = '$_limitPrefix${store.configKey}';
    if (mb == null) {
      await kv.remove(key);
    } else {
      await kv.setString(key, '$mb');
    }
    final next = {...state.userMb};
    if (mb == null) {
      next.remove(store);
    } else {
      next[store] = mb;
    }
    state =
        CacheSettingsState(userMb: next, keepMediaDays: state.keepMediaDays);
  }

  Future<void> setKeepMedia(KeepMedia keep) async {
    await ref.read(localKvStoreProvider).setString(_keepKey, '${keep.days}');
    state = CacheSettingsState(userMb: state.userMb, keepMediaDays: keep.days);
  }
}

@immutable
class CacheSettingsState {
  const CacheSettingsState({this.userMb = const {}, this.keepMediaDays});

  final Map<CacheStore, int> userMb;
  final int? keepMediaDays;
}

final cacheSettingsProvider =
    NotifierProvider<CacheSettings, CacheSettingsState>(CacheSettings.new);

/// The effective limits: admin ceilings from bootstrap, lowered by the user.
final cacheLimitsProvider = Provider<CacheLimits>((ref) {
  final config = ref.watch(featureFlagsControllerProvider).appConfig;
  final settings = ref.watch(cacheSettingsProvider);
  return CacheLimits.fromAppConfig(
    config,
    userMb: settings.userMb,
    userKeepMediaDays: settings.keepMediaDays,
  );
});

/// This process's network counters (see [NetworkUsageCounter]).
final networkUsageCounterProvider = Provider<NetworkUsageCounter>((ref) {
  final c = NetworkUsageCounter();
  ref.onDispose(c.dispose);
  return c;
});

/// The disk layer of the HTTP cache over [CacheDatabase], trimmed to the
/// `http` store's limit after every write.
class DriftHttpCacheStore implements HttpCacheStore {
  DriftHttpCacheStore(this._db, this._limitBytes);

  final CacheDatabase _db;
  final int Function() _limitBytes;
  Timer? _trim;

  @override
  Future<HttpCacheEntry?> read(String key) async {
    final row = await _db.httpEntry(key);
    if (row == null) return null;
    return HttpCacheEntry(
      etag: row.etag,
      data: jsonDecode(row.json),
      bytes: row.bytes,
      fetchedAt: row.fetchedAt,
    );
  }

  @override
  Future<void> write(String key, HttpCacheEntry entry, String json) async {
    await _db.putHttpEntry(
      key: key,
      etag: entry.etag,
      json: json,
      bytes: json.length,
      now: entry.fetchedAt,
    );
    _trim?.cancel();
    _trim = Timer(const Duration(seconds: 2), () {
      _db.trimHttp(_limitBytes()).catchError((Object _) {});
    });
  }

  @override
  Future<void> touch(String key, DateTime now, {required bool confirmed}) =>
      _db.touchHttpEntry(key, now, confirmed: confirmed);

  @override
  Future<void> clear() => _db.clearHttp();
}

/// The HTTP cache interceptor `dioProvider` installs (memory + disk).
/// On the web the disk layer is the tab's memory database (plan §5).
final httpCacheInterceptorProvider = Provider<HttpCacheInterceptor>(
  (ref) => HttpCacheInterceptor(
    // Widget tests drive a fake adapter through the real Dio: they keep the
    // memory level only (the disk level has its own tests).
    disk: isFlutterTest
        ? null
        : DriftHttpCacheStore(
            ref.watch(cacheDatabaseProvider),
            () => ref.read(cacheLimitsProvider).limitBytes(CacheStore.http),
          ),
    usage: ref.watch(networkUsageCounterProvider),
  ),
);

/// Today's network usage, persisted (SharedPreferences, one row per day,
/// yesterday dropped) so the settings screen can show «за сегодня».
class NetworkUsageToday extends Notifier<NetworkUsage> {
  static const _key = 'net.usage.today';
  Timer? _save;
  NetworkUsage _sessionBase = const NetworkUsage();

  @override
  NetworkUsage build() {
    final counter = ref.watch(networkUsageCounterProvider);
    final stored = _load();
    _sessionBase = counter.value;
    void onTick() {
      final delta = _minus(counter.value, _sessionBase);
      _sessionBase = counter.value;
      state = state + delta;
      _save?.cancel();
      _save = Timer(const Duration(seconds: 5), _persist);
    }

    counter.addListener(onTick);
    ref.onDispose(() {
      counter.removeListener(onTick);
      _save?.cancel();
    });
    return stored;
  }

  static String _today() {
    final d = DateTime.now();
    return '${d.year}-${d.month}-${d.day}';
  }

  NetworkUsage _load() {
    try {
      final raw = ref.read(localKvStoreProvider).getString(_key);
      if (raw == null) return const NetworkUsage();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      if (json['day'] != _today()) return const NetworkUsage();
      return NetworkUsage.fromJson(json);
    } on Object {
      return const NetworkUsage();
    }
  }

  void _persist() {
    ref
        .read(localKvStoreProvider)
        .setString(_key, jsonEncode({'day': _today(), ...state.toJson()}))
        .catchError((Object _) {});
  }

  static NetworkUsage _minus(NetworkUsage a, NetworkUsage b) => NetworkUsage(
        requests: a.requests - b.requests,
        bytesReceived: a.bytesReceived - b.bytesReceived,
        notModified: a.notModified - b.notModified,
        servedLocally: a.servedLocally - b.servedLocally,
      );
}

final networkUsageTodayProvider =
    NotifierProvider<NetworkUsageToday, NetworkUsage>(NetworkUsageToday.new);
