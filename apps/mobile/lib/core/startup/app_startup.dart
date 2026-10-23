import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
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

  Future<void>? _running;

  @override
  StartupStatus build() => StartupStatus.running;

  /// Idempotent while in flight; safe to call again from Retry.
  Future<void> run() => _running ??= _run().whenComplete(() => _running = null);

  Future<void> _run() async {
    state = StartupStatus.running;
    ref.read(startupProvidesMeProvider.notifier).set(true);
    try {
      final session =
          await ref.read(sessionControllerProvider.notifier).bootstrap();

      if (session == SessionBootstrapResult.offline) {
        // The phone's copies carry the screens; flags from the disk cache.
        await _flags(null).timeout(remoteConfigTimeout, onTimeout: () {});
        state = StartupStatus.offline;
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
      state = StartupStatus.ready;
    } finally {
      ref.read(startupProvidesMeProvider.notifier).set(false);
    }
    _l10nLater();
  }

  Future<void> _signedIn() async {
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
    await Future.wait<void>([
      _flags(null).timeout(remoteConfigTimeout, onTimeout: () {}),
      ref.read(currentUserControllerProvider.notifier).ensureLoaded(),
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

final appStartupProvider =
    NotifierProvider<AppStartupController, StartupStatus>(
  AppStartupController.new,
);
