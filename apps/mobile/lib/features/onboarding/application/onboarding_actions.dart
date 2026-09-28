import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/data/onboarding_repository.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Busy/error state of one onboarding screen's primary action.
@immutable
class StepActionState {
  const StepActionState({this.busy = false, this.error});

  final bool busy;
  final Object? error;
}

/// Why the server refused an onboarding action with `ONBOARDING_INCOMPLETE`
/// / `CLIENT_CONTACTS_INCOMPLETE`, and the step the user was moved to so
/// they can fix it. That step shows [error] (localized, e.g. "Add a photo")
/// and flags its required fields; cleared by the next successful action.
@immutable
class OnboardingBlocker {
  const OnboardingBlocker({required this.error, required this.step});

  final ApiException error;
  final OnboardingStepId step;
}

class OnboardingBlockerController extends Notifier<OnboardingBlocker?> {
  @override
  OnboardingBlocker? build() => null;

  void set(OnboardingBlocker? value) => state = value;
}

/// Kept alive across screens: set on one step, shown on another.
final onboardingBlockerProvider =
    NotifierProvider<OnboardingBlockerController, OnboardingBlocker?>(
        OnboardingBlockerController.new);

bool isOnboardingIncomplete(Object? error) =>
    error is ApiException &&
    (error.code == ApiErrorCodes.onboardingIncomplete ||
        error.code == ApiErrorCodes.clientContactsIncomplete);

/// Server mutations behind every onboarding step (docs/01_FOUNDATION_AUTH
/// .md §11). Each one ends by handing the fresh MeView to
/// [CurrentUserController]; AppRouterGuard then moves the user to
/// wherever the server state says they belong — so none of these navigate.
///
/// autoDispose: one instance per screen, so a stale error from one step
/// never shows up on the next.
class OnboardingActions extends Notifier<StepActionState> {
  @override
  StepActionState build() => const StepActionState();

  OnboardingRepository get _repo => ref.read(onboardingRepositoryProvider);

  CurrentUser? get _me => ref.read(currentUserControllerProvider).user;

  Future<bool> _run(Future<CurrentUser?> Function() body) async {
    if (state.busy) return false;
    state = const StepActionState(busy: true);
    try {
      final user = await body();
      ref.read(onboardingBlockerProvider.notifier).set(null);
      if (user != null) {
        ref.read(currentUserControllerProvider.notifier).apply(user);
        // Move forward explicitly; the guard alone keeps a user on an
        // already-saved step because going back is allowed.
        _go(AppRouterGuard.forwardRoute(user));
      }
      if (ref.mounted) state = const StepActionState();
      return true;
    } catch (e) {
      if (ref.mounted) state = StepActionState(error: e);
      if (e is ApiException && isOnboardingIncomplete(e)) {
        await _sendToMissing(e);
      }
      return false;
    }
  }

  void _go(String dest) {
    final router = ref.read(appRouterProvider);
    if (router.state.matchedLocation != dest) router.go(dest);
  }

  /// The server says something required is missing (e.g. the attorney
  /// photo, docs/03 §4.1): re-read me and move the user to the step that
  /// owns it, carrying the reason there (owner device test 2026-09-27:
  /// the tour's "Get started" used to just stay put).
  Future<void> _sendToMissing(ApiException error) async {
    final user = await ref.read(currentUserControllerProvider.notifier).load();
    if (user == null) return;
    final step = AppRouterGuard.requiredStep(user);
    if (step != null) {
      ref
          .read(onboardingBlockerProvider.notifier)
          .set(OnboardingBlocker(error: error, step: step));
    }
    _go(AppRouterGuard.forwardRoute(user));
  }

  void clearError() {
    if (state.error != null) state = const StepActionState();
  }

  /// §10.2 H: records every decision (required + optional) as one
  /// append-only batch, then moves to the role step.
  Future<bool> saveConsents(Map<ConsentType, bool> decisions,
          {Map<ConsentType, String?> documentIds = const {}}) =>
      _run(() async {
        await _repo.saveConsents([
          // Only the decisions the screen actually asked for (optional
          // consents move to Settings, owner decision 2026-09-27).
          for (final type in decisions.keys)
            ConsentDecision(
              type: type,
              granted: decisions[type] ?? false,
              documentId: documentIds[type],
            ),
        ]);
        return _repo.saveStep(OnboardingStepId.role);
      });

  /// Шаг 2: sets the role once, moves on, then refreshes the access token
  /// so its `role` claim is current (users.controller.ts: "afterwards call
  /// /auth/refresh to get the role claim").
  Future<bool> chooseRole(UserRole role) => _run(() async {
        final current = _me;
        if (current?.role == null) await _repo.setRole(role);
        final next = OnboardingStepId.role.nextFor(current?.role ?? role)!;
        final user = await _repo.saveStep(next);
        unawaited(
          ref
              .read(sessionControllerProvider.notifier)
              .refreshAccessToken()
              .then((_) {}, onError: (_) {}),
        );
        return user;
      });

  /// Saves the name + structured profile (client_profiles /
  /// attorney_profiles) and moves on — one server transaction.
  Future<bool> saveProfile(ProfileInput profile) => _run(() async {
        final next = OnboardingStepId.profile.nextFor(_me?.role)!;
        return _repo.saveProfileStep(next, profile);
      });

  /// Moves from [from] to its successor, merging [data] into the step
  /// data. From the last step this completes onboarding instead.
  Future<bool> advance(OnboardingStepId from, [Map<String, dynamic>? data]) {
    final next = from.nextFor(_me?.role);
    if (next == null) return complete();
    return _run(() => _repo.saveStep(next, data));
  }

  /// `POST /users/me/onboarding/complete`. On a 403 (`CLIENT_CONTACTS_
  /// INCOMPLETE` / `ONBOARDING_INCOMPLETE`) [_run] re-reads me and moves
  /// the user to whatever is still missing, with the reason shown there.
  Future<bool> complete() => _run(_repo.completeOnboarding);
}

final onboardingActionsProvider =
    NotifierProvider.autoDispose<OnboardingActions, StepActionState>(
        OnboardingActions.new);
