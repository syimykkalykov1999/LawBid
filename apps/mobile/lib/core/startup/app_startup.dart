import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

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
/// Flags (+ legal documents + min app version) and the translation bundle
/// are refreshed in parallel but time-boxed — both already have compiled-in
/// fallbacks, so a slow network must not keep the user on the splash. The
/// session check is the only step that decides where to go next.
class AppStartupController extends Notifier<StartupStatus> {
  static const remoteConfigTimeout = Duration(seconds: 4);

  Future<void>? _running;

  @override
  StartupStatus build() => StartupStatus.running;

  /// Idempotent while in flight; safe to call again from Retry.
  Future<void> run() => _running ??= _run().whenComplete(() => _running = null);

  Future<void> _run() async {
    state = StartupStatus.running;
    final remote = Future.wait<void>([
      ref.read(featureFlagsControllerProvider.notifier).refreshInBackground(),
      ref.read(l10nCacheControllerProvider.notifier).refreshInBackground(),
    ]).timeout(remoteConfigTimeout, onTimeout: () => const []);

    final session =
        await ref.read(sessionControllerProvider.notifier).bootstrap();
    await remote;

    if (session == SessionBootstrapResult.offline) {
      state = StartupStatus.offline;
      return;
    }
    if (session == SessionBootstrapResult.signedIn) {
      await ref.read(currentUserControllerProvider.notifier).ensureLoaded();
    }
    state = StartupStatus.ready;
  }
}

final appStartupProvider =
    NotifierProvider<AppStartupController, StartupStatus>(
  AppStartupController.new,
);
