import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/time/local_now.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';

/// Owner 2026-10-27 (app indexing, docs/architecture/PSEO_ASO_PACKAGE_PLAN
/// §3): iPhone Spotlight finds the attorney profiles and saved posts the
/// user themself opened or saved. Invisible plumbing — no screen, no button.
///
/// - On-device index only (CoreSpotlight `CSSearchableIndex.default()`); an
///   item is never sent to Apple's public index and never leaves the phone.
/// - Title and subtitle only: what the public profile / post already shows.
///   Never a client, never a phone number, e-mail or case.
/// - A tap on a result arrives as the item's link (`https://lawbid.dev/…`)
///   and goes through the same deep-link router as a Universal Link.
/// - Off for a user who switched «Do not sell or share my information» on
///   (Settings → Privacy) — the index is emptied at once. Emptied on
///   sign-out too. The flag [flag] can switch the whole thing off.
/// - Android has no equivalent: App Links alone (Firebase App Indexing is
///   deprecated, so no SDK). Web, tests and other platforms: no-op.
const spotlightChannelName = 'lawbid/spotlight';

/// iPhone and iPad only (CoreSpotlight); everything else is a no-op.
bool get spotlightSupported =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

/// CoreSpotlight domain identifiers: delete a whole kind at once.
abstract final class SpotlightDomain {
  static const attorney = 'com.lawbid.lawbid.attorney';
  static const post = 'com.lawbid.lawbid.post';
}

/// One searchable thing. [url] is both the identifier and the link the tap
/// opens; keep [title] / [subtitle] to what the public page shows.
@immutable
class SpotlightItem {
  const SpotlightItem({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.domain,
  });

  final String url;
  final String title;
  final String subtitle;
  final String domain;
}

/// The native half (`AppDelegate.swift`, `SpotlightBridge`).
abstract interface class SpotlightGateway {
  Future<void> index(SpotlightItem item);

  Future<void> remove(String url);

  Future<void> clear();
}

class ChannelSpotlightGateway implements SpotlightGateway {
  const ChannelSpotlightGateway([
    this._channel = const MethodChannel(spotlightChannelName),
  ]);

  final MethodChannel _channel;

  @override
  Future<void> index(SpotlightItem item) => _channel.invokeMethod<void>(
        'index',
        {
          'id': item.url,
          'title': item.title,
          'subtitle': item.subtitle,
          'domain': item.domain,
        },
      );

  @override
  Future<void> remove(String url) =>
      _channel.invokeMethod<void>('remove', {'id': url});

  @override
  Future<void> clear() => _channel.invokeMethod<void>('clear');
}

/// Keeps the on-device index small and private.
class SpotlightIndexer {
  SpotlightIndexer({
    required SpotlightGateway gateway,
    required LocalKvStore store,
    required DateTime Function() now,
    required bool Function() enabled,
    required Future<bool> Function() optedOut,
  })  : _gateway = gateway,
        _store = store,
        _now = now,
        _enabled = enabled,
        _optedOutCheck = optedOut;

  static const flag = 'spotlight_indexing';

  /// Most items kept on the phone; the oldest go first.
  static const maxItems = 60;

  /// The privacy choice is re-read from the server at most this often.
  static const optOutRecheck = Duration(minutes: 30);

  /// JSON list of the indexed links, oldest first.
  static const itemsKey = 'spotlight.items.v1';

  final SpotlightGateway _gateway;
  final LocalKvStore _store;
  final DateTime Function() _now;
  final bool Function() _enabled;
  final Future<bool> Function() _optedOutCheck;

  bool _optedOut = true;
  DateTime? _checkedAt;
  bool _emptiedForOptOut = false;

  /// Links currently in the index (oldest first).
  List<String> get indexed {
    final raw = _store.getString(itemsKey);
    if (raw == null) return <String>[];
    try {
      return (jsonDecode(raw) as List).whereType<String>().toList();
    } on Object {
      return <String>[];
    }
  }

  Future<void> _save(List<String> urls) =>
      _store.setString(itemsKey, jsonEncode(urls));

  /// Fail closed: null = the choice cannot be read (signed out, offline),
  /// the item is simply not indexed this time.
  Future<bool?> _isOptedOut() async {
    final at = _checkedAt;
    if (at != null && _now().difference(at) < optOutRecheck) return _optedOut;
    try {
      _optedOut = await _optedOutCheck();
      _checkedAt = _now();
      return _optedOut;
    } on Object {
      return null;
    }
  }

  /// Adds [item] (or moves it to the newest place). Best effort, never throws.
  Future<void> add(SpotlightItem item) async {
    try {
      if (!_enabled()) return;
      final optedOut = await _isOptedOut();
      if (optedOut == null) return;
      if (optedOut) {
        if (!_emptiedForOptOut) {
          _emptiedForOptOut = true;
          await clear();
        }
        return;
      }
      _emptiedForOptOut = false;
      await _gateway.index(item);
      final urls = [...indexed.where((u) => u != item.url), item.url];
      while (urls.length > maxItems) {
        await _gateway.remove(urls.removeAt(0));
      }
      await _save(urls);
    } on Object catch (e) {
      if (kDebugMode) debugPrint('spotlight: $e');
    }
  }

  /// Takes one link out (a post un-saved).
  Future<void> remove(String url) async {
    try {
      if (!_enabled()) return;
      await _gateway.remove(url);
      await _save([...indexed.where((u) => u != url)]);
    } on Object catch (e) {
      if (kDebugMode) debugPrint('spotlight: $e');
    }
  }

  /// Empties the whole index (sign-out, privacy opt-out).
  Future<void> clear() async {
    try {
      await _gateway.clear();
      await _store.remove(itemsKey);
    } on Object catch (e) {
      if (kDebugMode) debugPrint('spotlight: $e');
    }
  }
}

final spotlightIndexerProvider = Provider<SpotlightIndexer>((ref) {
  final indexer = SpotlightIndexer(
    gateway: const ChannelSpotlightGateway(),
    store: ref.watch(localKvStoreProvider),
    now: ref.watch(appClockProvider),
    enabled: () =>
        spotlightSupported &&
        ref
            .read(featureFlagsControllerProvider)
            .isEnabled(SpotlightIndexer.flag),
    optedOut: () async =>
        (await ref.read(privacyRepositoryProvider).settings()).doNotSell,
  );
  // Another person may sign in on this phone: the previous account's
  // profiles and saved posts must not stay searchable.
  ref.listen(sessionControllerProvider.select((s) => s?.sub), (prev, next) {
    if (prev != null && prev != next) unawaited(indexer.clear());
  });
  return indexer;
});

/// Fire-and-forget form for call sites inside providers (see
/// `profile_spotlight.dart`, `post_spotlight.dart`). No-op off iOS before
/// anything else is read.
void spotlightAdd(Ref ref, SpotlightItem? item) {
  if (item == null || !spotlightSupported) return;
  unawaited(ref.read(spotlightIndexerProvider).add(item));
}

void spotlightRemove(Ref ref, String url) {
  if (!spotlightSupported) return;
  unawaited(ref.read(spotlightIndexerProvider).remove(url));
}

/// Shortens [text] to one line of at most [max] characters.
String spotlightLine(String text, {int max = 80}) {
  final line = text.split('\n').map((l) => l.trim()).firstWhere(
        (l) => l.isNotEmpty,
        orElse: () => '',
      );
  return line.length <= max ? line : '${line.substring(0, max - 1).trim()}…';
}
