import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/demo/data/demo_repository.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

const _kBannerHiddenKey = 'demo.banner_hidden';

final demoRepositoryProvider = Provider<DemoRepository>(
  (ref) => DemoRepository(ref.watch(dioProvider)),
);

/// The partner's demo dashboard (`GET /demo/me`, real JWT). `enabled` is
/// false for everyone without the demo right — the section stays hidden.
final demoMeProvider = FutureProvider.autoDispose<DemoMe>(
  (ref) => ref.watch(demoRepositoryProvider).me(),
);

/// Whether the CURRENT session is a demo one (access-token claim `demo`).
final isDemoSessionProvider = Provider<bool>(
  (ref) =>
      ref.watch(sessionControllerProvider.select((s) => s?.isDemo)) ?? false,
);

@immutable
class DemoUiState {
  const DemoUiState({
    this.bannerHidden = false,
    this.hasRealSession = false,
    this.busy = false,
  });

  /// «Скрыть» on the floating banner — in memory + prefs, so a recording
  /// stays clean across restarts; a 24 px handle brings it back.
  final bool bannerHidden;

  /// A real account's refresh token is parked (`lawbid.realRefreshToken`):
  /// exiting the demo returns to it. False for a blogger who came in with
  /// a demo code — exiting signs out to the welcome screen.
  final bool hasRealSession;

  /// enter/exit in flight.
  final bool busy;

  DemoUiState copyWith({
    bool? bannerHidden,
    bool? hasRealSession,
    bool? busy,
  }) =>
      DemoUiState(
        bannerHidden: bannerHidden ?? this.bannerHidden,
        hasRealSession: hasRealSession ?? this.hasRealSession,
        busy: busy ?? this.busy,
      );
}

/// Owner 2026-10-05 (docs/ops/demo-world.md): enters and leaves demo
/// sessions. `enterDemo` parks the REAL refresh token under a separate
/// secure-store key before the demo tokens replace it; `exitDemo` logs the
/// demo session out, restores the real token and refreshes — or, when no
/// real session existed (blogger via code), leaves the user signed out on
/// the welcome screen. Navigation is the router guard's job: the session
/// change (`sub`) re-runs it.
class DemoSessionController extends Notifier<DemoUiState> {
  @override
  DemoUiState build() {
    var hidden = false;
    try {
      hidden =
          ref.read(localKvStoreProvider).getString(_kBannerHiddenKey) == '1';
    } catch (_) {}
    unawaited(_loadHasRealSession());
    return DemoUiState(bannerHidden: hidden);
  }

  Future<void> _loadHasRealSession() async {
    try {
      final real =
          await ref.read(tokenSecureStoreProvider).readRealRefreshToken();
      state = state.copyWith(hasRealSession: real != null);
    } catch (_) {}
  }

  /// Switches the app to [session]. Safe to call from a real session
  /// (parks it), from another demo session (keeps the parked real token)
  /// and from signed-out (blogger via code).
  Future<void> enterDemo(DemoSession session) async {
    if (state.busy) return;
    state = state.copyWith(busy: true);
    try {
      final store = ref.read(tokenSecureStoreProvider);
      final current = ref.read(sessionControllerProvider);
      var hasReal = state.hasRealSession;
      if (current != null && !current.isDemo) {
        final real = await store.readRefreshToken();
        if (real != null) {
          await store.writeRealRefreshToken(real);
          hasReal = true;
        }
      } else if (current == null) {
        hasReal = await store.readRealRefreshToken() != null;
      }
      await ref
          .read(sessionControllerProvider.notifier)
          .switchSession(session.tokens);
      // The guard holds the splash until the demo user's `GET /users/me`
      // lands, instead of routing by the previous account's role.
      ref.read(currentUserControllerProvider.notifier).resetForNewSession();
      await _setBannerHidden(false);
      state = state.copyWith(hasRealSession: hasReal);
    } finally {
      state = state.copyWith(busy: false);
    }
  }

  /// Leaves the demo. Returns true when the real account is back, false
  /// when the user is now signed out (nothing was parked, or the parked
  /// token was rejected).
  Future<bool> exitDemo() async {
    final current = ref.read(sessionControllerProvider);
    if (current == null || !current.isDemo) return current != null;
    if (state.busy) return false;
    state = state.copyWith(busy: true);
    try {
      try {
        // Best effort: ends the demo session server-side (header is added
        // by AuthInterceptor while the demo session is still in memory).
        await ref.read(authApiClientProvider).logout();
      } catch (_) {}
      // Clears the demo tokens and restores the parked real account.
      await ref.read(sessionControllerProvider.notifier).clear();
      if (ref.read(sessionControllerProvider) != null) {
        ref.read(currentUserControllerProvider.notifier).resetForNewSession();
      }
      await _setBannerHidden(false);
      state = state.copyWith(hasRealSession: false);
      return ref.read(sessionControllerProvider) != null;
    } finally {
      state = state.copyWith(busy: false);
    }
  }

  Future<void> hideBanner() => _setBannerHidden(true);

  Future<void> showBanner() => _setBannerHidden(false);

  Future<void> _setBannerHidden(bool hidden) async {
    state = state.copyWith(bannerHidden: hidden);
    try {
      final kv = ref.read(localKvStoreProvider);
      if (hidden) {
        await kv.setString(_kBannerHiddenKey, '1');
      } else {
        await kv.remove(_kBannerHiddenKey);
      }
    } catch (_) {}
  }
}

final demoSessionControllerProvider =
    NotifierProvider<DemoSessionController, DemoUiState>(
  DemoSessionController.new,
);
