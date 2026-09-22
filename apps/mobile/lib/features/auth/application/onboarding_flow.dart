import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/l10n/l10n_providers.dart';
import '../../../shared/domain/user_role.dart';
import '../data/auth_repository.dart';
import '../domain/otp_verify_result.dart';
import '../domain/onboarding_flow_state.dart';
import '../domain/onboarding_step.dart';
import '../domain/social_login_result.dart';
import 'auth_providers.dart';

part 'onboarding_flow.g.dart';

/// Drives the welcome → phone → otp → role flow. See
/// `OnboardingFlowState`'s doc comment for why this is one notifier for all
/// 4 screens rather than one per screen.
@riverpod
class OnboardingFlow extends _$OnboardingFlow {
  @override
  OnboardingFlowState build() {
    final saved = ref.read(onboardingLocalStoreProvider).read();
    if (saved == null) return const OnboardingFlowState();
    return OnboardingFlowState(step: saved.step, phoneNumber: saved.phoneNumber);
  }

  Future<void> _persist() => ref
      .read(onboardingLocalStoreProvider)
      .save(step: state.step, phoneNumber: state.phoneNumber);

  /// Welcome screen's "Продолжить с телефоном" — screen 1 → 2. Email is
  /// also a button on the welcome screen (file 07 §6.1) but its sign-in
  /// logic has no native SDK to wire up (there's no "email SDK") and stays
  /// a "not built yet" affordance; Apple/Google are wired for real as of
  /// Phase 3 (docs/CHANGELOG.md) — see [signInWithApple]/[signInWithGoogle]
  /// below.
  void goToPhoneStep() {
    state = state.copyWith(step: OnboardingStep.phone, errorMessage: null);
    unawaited(_persist());
  }

  Future<bool> submitPhoneNumber(String e164Phone) async {
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    try {
      await ref.read(authRepositoryProvider).requestOtp(e164Phone);
      state = state.copyWith(
        step: OnboardingStep.otp,
        phoneNumber: e164Phone,
        isSubmitting: false,
      );
      unawaited(_persist());
      return true;
    } catch (_) {
      state = state.copyWith(
        isSubmitting: false,
        errorMessage: 'Не удалось отправить код. Проверьте соединение.',
      );
      return false;
    }
  }

  Future<void> resendOtp() async {
    final phone = state.phoneNumber;
    if (phone == null) return;
    await ref.read(authRepositoryProvider).requestOtp(phone);
  }

  /// Real-backend wiring pass (docs/CHANGELOG.md, stage-1.7-auth): branches
  /// on `AuthTokensResult.isNewUser` (surfaced via
  /// `OtpVerifyResult.success.isNewUser`) — an existing user who re-verifies
  /// (e.g. signing back in on a new device) skips the role step entirely
  /// and lands straight in the shell; a brand-new user proceeds to role
  /// selection exactly as before. `OtpScreen._handleCompleted` reads
  /// `state.step` after this returns to decide where to navigate.
  Future<bool> verifyOtp(String code) async {
    final phone = state.phoneNumber;
    if (phone == null) return false;
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    final result = await ref.read(authRepositoryProvider).verifyOtp(phoneNumber: phone, code: code);
    return result.when(
      success: (isNewUser) async {
        state = state.copyWith(otpVerified: true, isSubmitting: false);
        if (isNewUser) {
          state = state.copyWith(step: OnboardingStep.role);
          unawaited(_persist());
        } else {
          await completeOnboarding();
        }
        return true;
      },
      invalid: () async {
        state = state.copyWith(isSubmitting: false, errorMessage: 'Неверный код');
        return false;
      },
      expired: () async {
        state = state.copyWith(isSubmitting: false, errorMessage: 'Код истёк, запросите новый');
        return false;
      },
      locked: () async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: 'Слишком много попыток. Запросите код позже.',
        );
        return false;
      },
      rateLimited: (retryAfterSeconds) async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: 'Слишком много попыток. Повторите через $retryAfterSeconds с.',
        );
        return false;
      },
      networkError: () async {
        state = state.copyWith(isSubmitting: false, errorMessage: 'Ошибка сети, попробуйте снова');
        return false;
      },
    );
  }

  /// Welcome screen's Apple button (file 07 §6.1). Phase 3 of the auth
  /// networking work (docs/CHANGELOG.md) — native sign-in via
  /// `AuthRepository.signInWithApple()`, then the same isNewUser →
  /// role-step / else → `completeOnboarding()` branch as [verifyOtp]
  /// above. Unlike [verifyOtp], a cancelled native sheet
  /// (`SocialLoginResult.cancelled()`) is not an error — no
  /// `errorMessage` is set for it, so the welcome screen shows nothing and
  /// the user can just try again.
  Future<bool> signInWithApple() =>
      _signInWithSocial((repo) => repo.signInWithApple());

  /// Same as [signInWithApple], via Google.
  Future<bool> signInWithGoogle() =>
      _signInWithSocial((repo) => repo.signInWithGoogle());

  Future<bool> _signInWithSocial(
    Future<SocialLoginResult> Function(AuthRepository) signIn,
  ) async {
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    final result = await signIn(ref.read(authRepositoryProvider));
    final t = ref.read(translatorProvider);
    return result.when(
      success: (isNewUser) async {
        state = state.copyWith(isSubmitting: false);
        if (isNewUser) {
          state = state.copyWith(step: OnboardingStep.role);
          unawaited(_persist());
        } else {
          await completeOnboarding();
        }
        return true;
      },
      cancelled: () async {
        state = state.copyWith(isSubmitting: false);
        return false;
      },
      invalidToken: () async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: t.t('auth.social.error.invalidToken'),
        );
        return false;
      },
      providerDisabled: () async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: t.t('auth.social.error.providerDisabled'),
        );
        return false;
      },
      accountExists: (maskedIdentifier, availableMethods) async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: t.t('auth.social.error.accountExists', {
            'identifier': maskedIdentifier,
            'methods': availableMethods.join(', '),
          }),
        );
        return false;
      },
      suspended: () async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: t.t('auth.social.error.suspended'),
        );
        return false;
      },
      deleted: () async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: t.t('auth.social.error.deleted'),
        );
        return false;
      },
      networkError: () async {
        state = state.copyWith(
          isSubmitting: false,
          errorMessage: t.t('auth.social.error.network'),
        );
        return false;
      },
    );
  }

  void selectRole(UserRole role) {
    state = state.copyWith(selectedRole: role);
  }

  /// Role screen's "Продолжить" (and the existing-user fast path in
  /// [verifyOtp] above). Clears the resume-after-kill checkpoint — once
  /// onboarding is complete there's nothing left to resume.
  ///
  /// KNOWN GAP (docs/CHANGELOG.md, flagged for the owner): this does NOT
  /// yet write into `currentUserRoleProvider` (shared/domain/
  /// current_role_provider.dart), which stays hardcoded to `UserRole.client`
  /// per its stage-1.5 stub doc comment. The backend has no endpoint to
  /// persist the chosen role yet either (this pass's blueprint says not to
  /// add one) — an Attorney who finishes onboarding still sees the
  /// Client-flavored bottom nav until a later pass adds that endpoint.
  Future<void> completeOnboarding() async {
    state = state.copyWith(step: OnboardingStep.completed);
    await ref.read(onboardingLocalStoreProvider).clear();
  }

  /// Used by the back buttons on phone/otp/role — moves the step backward
  /// without losing what's already been entered (e.g. going otp → phone
  /// keeps `phoneNumber` so the field isn't empty again).
  void goBackTo(OnboardingStep step) {
    state = state.copyWith(step: step, errorMessage: null);
    unawaited(_persist());
  }
}
