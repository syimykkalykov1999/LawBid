import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/realtime/app_signals.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/app_session.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/data/current_user_mapper.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

enum StartupStatus {
  /// Splash is doing its work; the guard holds every route at `/splash`.
  running,

  /// Done — the guard now routes by session + `GET /users/me`.
  ready,

  /// A stored session exists but the network is unreachable: the splash
  /// shows the offline state with Retry instead of logging the user out.
  offline,
}

/// Splash sequence (docs/01_FOUNDATION_AUTH.md §10.2 A: "проверка токена,
/// версии приложения, загрузка feature flags и переводов. Если сессия
/// валидна → главный экран, иначе → Welcome").
///
/// Owner 2026-10-22 (client economy plan, package G): a signed-in start is
/// the token refresh plus **one** `GET /me/session` (me + badges + flags +
/// config version; a 304 when nothing changed). `/config/bootstrap` is
/// read from the phone's copy unless the server's config version moved;
/// the translations delta runs two seconds after the first frame, off the
/// critical path. Guests keep the old bootstrap + translations pair.
class AppStartupController extends Notifier<StartupStatus> {
  static const remoteConfigTimeout = Duration(seconds: 4);

  /// Perf batch 4 (row 127): the longest the cached start looks for the
  /// phone's `/me/session` copy (memory, then disk — milliseconds as a rule)
  /// before it falls back to the start over the network.
  static const phoneCopyTimeout = Duration(seconds: 1);

  Future<void>? _revalidating;

  Future<void>? _running;
  Timer? _offlineRetry;
  int _offlineRetries = 0;
  final Stopwatch _sinceConfig = Stopwatch();
  Future<void>? _configRefresh;

  @override
  StartupStatus build() {
    ref.onDispose(() => _offlineRetry?.cancel());
    try {
      final sub = ref.read(appSignalsProvider).signals.listen(_onSignal);
      ref.onDispose(() => unawaited(sub.cancel()));
    } on Object catch (e) {
      // No platform channels (a plain unit test): no resume signal.
      debugPrint('startup: no app signals: $e');
    }
    return StartupStatus.running;
  }

  Future<void>? _early;

  /// S16-1: the first run, started by `runLawBid` before `runApp` so the
  /// keychain read + token refresh overlap the first frame and the
  /// translation load instead of waiting for the splash's post-frame
  /// callback (Instagram/WhatsApp open from the local copy and sync behind
  /// it).
  Future<void> prime() => _early ??= run();

  /// What the splash calls on mount: it joins the run [prime] started (once);
  /// any later visit to the splash (demo switch, sign-out) runs again.
  Future<void> start() {
    final early = _early;
    if (early == null) return run();
    _early = null;
    return early;
  }

  /// Idempotent while in flight; safe to call again from Retry.
  Future<void> run() {
    _offlineRetry?.cancel();
    return _running ??= _run().whenComplete(() => _running = null);
  }

  void _onSignal(AppSignal signal) {
    switch (signal) {
      case AppSignal.resumed:
        _revalidateIfCached();
        unawaited(refreshConfigIfStale());
      case AppSignal.networkBack:
        // The offline splash does not wait for its timer once the network
        // is back.
        if (state == StartupStatus.offline) unawaited(run());
        _revalidateIfCached();
      case AppSignal.paused:
        break;
    }
  }

  /// S15-2: the offline splash retries by itself (5 s, 15 s, 30 s, then
  /// every minute), next to its Retry button.
  void _scheduleOfflineRetry() {
    _offlineRetry?.cancel();
    final delays = ref.read(startupOfflineRetryDelaysProvider);
    final delay = delays[_offlineRetries.clamp(0, delays.length - 1)];
    _offlineRetries++;
    _offlineRetry = Timer(delay, () {
      if (!ref.mounted || state != StartupStatus.offline) return;
      unawaited(run());
    });
  }

  /// S15-4: on resume after [startupConfigResumeAfterProvider], re-reads `GET /me/session`
  /// (a 304 from the HTTP cache when nothing changed) and applies flags,
  /// kill switches, tuning and the forced-update answer again. A realtime
  /// `config:changed` nudge (the server does not send one yet) can call
  /// [refreshConfigNow] directly.
  Future<void> refreshConfigIfStale() async {
    if (state != StartupStatus.ready) return;
    if (_sinceConfig.isRunning &&
        _sinceConfig.elapsed < ref.read(startupConfigResumeAfterProvider)) {
      return;
    }
    await refreshConfigNow();
  }

  /// Re-reads flags/tuning now (single-flight).
  Future<void> refreshConfigNow() => _configRefresh ??= _refreshConfig()
      .catchError((Object e) => debugPrint('config refresh: $e'))
      .whenComplete(() => _configRefresh = null);

  Future<void> _refreshConfig() async {
    final signedIn = ref.read(sessionControllerProvider) != null;
    final loaded = signedIn ? await _loadSession() : null;
    if (!ref.mounted) return;
    if (loaded != null) ref.read(appSessionProvider.notifier).set(loaded);
    await _flags(loaded).timeout(remoteConfigTimeout, onTimeout: () {});
    _sinceConfig
      ..reset()
      ..start();
  }

  Future<void> _run() async {
    state = StartupStatus.running;
    ref.read(startupProvidesMeProvider.notifier).set(true);
    if (await _openFromCache()) {
      // Perf batch 4 (row 127): the first screens open now from the phone's
      // copies; the token refresh and the live `/me/session` follow.
      _offlineRetries = 0;
      state = StartupStatus.ready;
      unawaited(revalidateCachedStart());
      _l10nLater();
      return;
    }
    try {
      final session =
          await ref.read(sessionControllerProvider.notifier).bootstrap();

      if (session == SessionBootstrapResult.offline) {
        // The phone's copies carry the screens; flags from the disk cache.
        await _flags(null).timeout(remoteConfigTimeout, onTimeout: () {});
        state = StartupStatus.offline;
        _scheduleOfflineRetry();
        return;
      }
      if (session == SessionBootstrapResult.signedIn) {
        await _signedIn();
      } else {
        await Future.wait<void>([
          _flags(null),
          ref.read(l10nCacheControllerProvider.notifier).refreshInBackground(),
        ]).timeout(remoteConfigTimeout, onTimeout: () => const []);
      }
      _offlineRetries = 0;
      _sinceConfig
        ..reset()
        ..start();
      state = StartupStatus.ready;
    } finally {
      ref.read(startupProvidesMeProvider.notifier).set(false);
    }
    _l10nLater();
  }

  /// Perf batch 4 (row 127), «stale-while-revalidate start» (WhatsApp /
  /// Telegram open from the local copy and sync behind it): when the phone
  /// has the last session's claims for the stored refresh token AND its last
  /// `GET /me/session` copy of that same account, the session, the user,
  /// the badges and the flags come from them with no request. Nothing from
  /// another account: the claims are bound to the stored token, the HTTP
  /// copy is keyed by the account, and its `me.id` must be the claims' `sub`.
  Future<bool> _openFromCache() async {
    final session = ref.read(sessionControllerProvider.notifier);
    final cached = await session.cachedSession();
    if (cached == null || !ref.mounted) return false;
    final loader = ref.read(appSessionLoaderProvider);
    final api.AppSessionDto? copy;
    try {
      copy = await readFromPhoneOnly(loader.load, asUser: cached.sub)
          .timeout(phoneCopyTimeout);
    } on Object catch (e) {
      debugPrint('cached start: no copy of me/session: $e');
      return false;
    }
    if (copy == null || copy.me.id != cached.sub || !ref.mounted) return false;
    session.openCached(cached);
    ref.read(appSessionProvider.notifier).set(copy);
    ref
        .read(currentUserControllerProvider.notifier)
        .apply(CurrentUserMapper.fromDto(copy.me));
    // The flags of the copy at once; the live ones come with the refresh.
    unawaited(
      _flags(copy)
          .timeout(remoteConfigTimeout, onTimeout: () {})
          .catchError((Object e) => debugPrint('cached start flags: $e')),
    );
    return true;
  }

  void _revalidateIfCached() {
    if (state != StartupStatus.ready) return;
    if (ref.read(sessionControllerProvider)?.awaitsRefresh ?? false) {
      unawaited(revalidateCachedStart());
    }
  }

  /// The cached start's background half (single-flight): the token refresh,
  /// then the live `GET /me/session`. Revoked / expired → the session ends
  /// and the guard shows the sign-in (the account's data leaves the phone
  /// with it); no network → the cached session stays with the offline UI,
  /// and the network coming back or a resume tries again.
  Future<void> revalidateCachedStart() =>
      _revalidating ??= _revalidate().whenComplete(() => _revalidating = null);

  Future<void> _revalidate() async {
    final before = ref.read(sessionControllerProvider)?.sub;
    ref.read(startupProvidesMeProvider.notifier).set(true);
    try {
      final result =
          await ref.read(sessionControllerProvider.notifier).revalidate();
      if (!ref.mounted) return;
      switch (result) {
        case SessionBootstrapResult.signedIn:
          final now = ref.read(sessionControllerProvider)?.sub;
          if (now != before) {
            // A demo session gave way to the parked real account.
            ref.read(appSessionProvider.notifier).set(null);
            ref
                .read(currentUserControllerProvider.notifier)
                .resetForNewSession();
            await _refreshConfig();
            return;
          }
          await _signedIn(live: true);
          _sinceConfig
            ..reset()
            ..start();
        case SessionBootstrapResult.offline:
          break;
        case SessionBootstrapResult.signedOut:
          ref.read(appSessionProvider.notifier).set(null);
      }
    } finally {
      if (ref.mounted) {
        ref.read(startupProvidesMeProvider.notifier).set(false);
      }
    }
  }

  /// [live]: the user on screen came from the phone's copy, so the fallback
  /// asks `GET /users/me` again instead of keeping it.
  Future<void> _signedIn({bool live = false}) async {
    final loaded = await _loadSession();
    if (loaded != null) {
      ref.read(appSessionProvider.notifier).set(loaded);
      ref
          .read(currentUserControllerProvider.notifier)
          .apply(CurrentUserMapper.fromDto(loaded.me));
      await _flags(loaded).timeout(remoteConfigTimeout, onTimeout: () {});
      return;
    }
    // The one-answer start failed (an older server, a timeout): the old
    // three requests, as before.
    final users = ref.read(currentUserControllerProvider.notifier);
    await Future.wait<void>([
      _flags(null).timeout(remoteConfigTimeout, onTimeout: () {}),
      if (live) users.load() else users.ensureLoaded(),
    ]);
  }

  Future<api.AppSessionDto?> _loadSession() async {
    try {
      return await ref
          .read(appSessionLoaderProvider)
          .load()
          .timeout(remoteConfigTimeout);
    } on Object catch (e) {
      debugPrint('me/session: $e');
      return null;
    }
  }

  Future<void> _flags(api.AppSessionDto? session) {
    final controller = ref.read(featureFlagsControllerProvider.notifier)
      ..applySessionTimings(session?.client.timings);
    return controller.refreshInBackground(
      knownVersion: session?.bootstrapVersion,
      flags: session?.flags,
    );
  }

  /// Translations: the phone already shows its cached bundle; the delta is
  /// asked for shortly after the first frame.
  void _l10nLater() {
    Future<void>.delayed(ref.read(startupL10nDelayProvider), () {
      if (!ref.mounted) return;
      unawaited(
        ref
            .read(l10nCacheControllerProvider.notifier)
            .refreshInBackground()
            .catchError((Object _) {}),
      );
    });
  }
}

/// How long after the splash the translations delta is asked for (tests
/// shorten it).
final startupL10nDelayProvider =
    Provider<Duration>((ref) => const Duration(seconds: 2));

/// S15-4: flags, kill switches and tuning are asked again when the app comes
/// back after at least this long (tests shorten it).
final startupConfigResumeAfterProvider =
    Provider<Duration>((ref) => const Duration(minutes: 15));

/// S15-2: waits between the offline splash's own retries (the last one
/// repeats). Tests shorten it.
final startupOfflineRetryDelaysProvider = Provider<List<Duration>>(
  (ref) => const [
    Duration(seconds: 5),
    Duration(seconds: 15),
    Duration(seconds: 30),
    Duration(minutes: 1),
  ],
);

final appStartupProvider =
    NotifierProvider<AppStartupController, StartupStatus>(
  AppStartupController.new,
);
