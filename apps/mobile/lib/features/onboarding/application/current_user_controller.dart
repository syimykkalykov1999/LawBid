import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/shared/domain/user_role.dart';

enum CurrentUserStatus {
  /// No session → nothing to load.
  idle,

  /// First load in flight (no [CurrentUserState.user] yet).
  loading,

  /// [CurrentUserState.user] is present (possibly being refreshed).
  ready,

  /// First load failed; [CurrentUserState.error] says why.
  failed,
}

@immutable
class CurrentUserState {
  const CurrentUserState._(this.status, {this.user, this.error});

  const CurrentUserState.idle() : this._(CurrentUserStatus.idle);
  const CurrentUserState.loading() : this._(CurrentUserStatus.loading);
  const CurrentUserState.ready(CurrentUser user)
      : this._(CurrentUserStatus.ready, user: user);
  const CurrentUserState.failed(Object error)
      : this._(CurrentUserStatus.failed, error: error);

  final CurrentUserStatus status;
  final CurrentUser? user;
  final Object? error;

  bool get isOffline =>
      error is ApiException && (error! as ApiException).isNetworkError;
}

/// The "SessionState driven by GET /users/me" half of stage 1.7 (docs/
/// 01_FOUNDATION_AUTH.md §11: "Все redirect решения принимает единый
/// AppRouterGuard, основанный на SessionState (Riverpod)"). Token claims
/// live in [SessionController]; everything onboarding/role/contacts-related
/// lives here, fetched from `GET /users/me` and replaced wholesale by
/// every `/users/me*` mutation (they all answer with the fresh MeView).
///
/// Loads automatically whenever a session appears (sign-in, cold-start
/// bootstrap) and resets to idle when it disappears (logout, failed
/// refresh). The router listens to this provider, so any change here
/// re-runs the guard — screens never navigate forward themselves.
class CurrentUserController extends Notifier<CurrentUserState> {
  Future<CurrentUser?>? _inFlight;

  @override
  CurrentUserState build() {
    ref.listen<String?>(
      sessionControllerProvider.select((s) => s?.sub),
      (previous, next) {
        if (next == null) {
          _inFlight = null;
          state = const CurrentUserState.idle();
        } else if (previous != next) {
          unawaited(load());
        }
      },
    );
    final hasSession = ref.read(sessionControllerProvider) != null;
    if (hasSession) {
      Future.microtask(load);
      return const CurrentUserState.loading();
    }
    return const CurrentUserState.idle();
  }

  /// Fetches `GET /users/me`. Concurrent calls share one request. Keeps the
  /// previous user visible while refreshing; only a FIRST-load failure
  /// moves to [CurrentUserStatus.failed]. Returns the loaded user or null.
  Future<CurrentUser?> load() {
    final existing = _inFlight;
    if (existing != null) return existing;
    if (ref.read(sessionControllerProvider) == null) {
      state = const CurrentUserState.idle();
      return Future.value();
    }
    if (state.user == null) state = const CurrentUserState.loading();
    final future = _fetch().whenComplete(() => _inFlight = null);
    _inFlight = future;
    return future;
  }

  Future<CurrentUser?> _fetch() async {
    try {
      final user = await ref.read(onboardingRepositoryProvider).fetchMe();
      if (ref.read(sessionControllerProvider) == null) return null;
      state = CurrentUserState.ready(user);
      return user;
    } catch (e) {
      if (state.user == null) state = CurrentUserState.failed(e);
      return state.user;
    }
  }

  /// Makes sure a user is loaded (used right after sign-in so the next
  /// navigation decision already sees it).
  Future<CurrentUser?> ensureLoaded() async => state.user ?? await load();

  /// Replaces the user with a fresh MeView returned by a mutation.
  void apply(CurrentUser user) => state = CurrentUserState.ready(user);
}

final currentUserControllerProvider =
    NotifierProvider<CurrentUserController, CurrentUserState>(
        CurrentUserController.new);

/// The signed-in user's role (docs/01_FOUNDATION_AUTH.md §11), from
/// `GET /users/me`, falling back to the access token's `role` claim while
/// me is loading. Replaces the stage-1.5 hardcoded-client stub.
final currentUserRoleProvider = Provider<UserRole?>((ref) {
  final fromMe =
      ref.watch(currentUserControllerProvider.select((s) => s.user?.role));
  if (fromMe != null) return fromMe;
  return parseUserRole(
      ref.watch(sessionControllerProvider.select((s) => s?.role)));
});
