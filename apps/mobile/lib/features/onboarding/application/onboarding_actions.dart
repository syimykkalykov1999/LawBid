import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
      if (user != null)
        ref.read(currentUserControllerProvider.notifier).apply(user);
      if (ref.mounted) state = const StepActionState();
      return true;
    } catch (e) {
      if (ref.mounted) state = StepActionState(error: e);
      return false;
    }
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
          for (final type in ConsentType.values)
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
  /// INCOMPLETE` / `ONBOARDING_INCOMPLETE`) re-reads me so the guard sends
  /// the user to whatever is still missing; the error stays visible.
  Future<bool> complete() async {
    final ok = await _run(_repo.completeOnboarding);
    if (ok || !ref.mounted) return ok;
    final error = state.error;
    if (!ok &&
        error is ApiException &&
        (error.code == ApiErrorCodes.clientContactsIncomplete ||
            error.code == ApiErrorCodes.onboardingIncomplete)) {
      await ref.read(currentUserControllerProvider.notifier).load();
    }
    return ok;
  }
}

final onboardingActionsProvider =
    NotifierProvider.autoDispose<OnboardingActions, StepActionState>(
        OnboardingActions.new);
