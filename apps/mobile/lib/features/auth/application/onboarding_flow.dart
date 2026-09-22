import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../shared/domain/user_role.dart';
import '../data/onboarding_local_store.dart';
import '../domain/onboarding_flow_state.dart';
import '../domain/onboarding_step.dart';
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

  /// Welcome screen's "Продолжить с телефоном" — screen 1 → 2. Email/
  /// Apple/Google are buttons on the welcome screen too (file 07 §6.1) but
  /// their sign-in logic needs the native SDKs / real backend this stub
  /// layer doesn't have yet (see [AuthRepository] doc comment) — tapping
  /// them shows a "not built yet" message for now rather than pretending to
  /// authenticate. This mirrors exactly what the owner-approved preview
  /// artifact already showed for those three buttons.
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

  Future<bool> verifyOtp(String code) async {
    final phone = state.phoneNumber;
    if (phone == null) return false;
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    final result = await ref.read(authRepositoryProvider).verifyOtp(phoneNumber: phone, code: code);
    return result.when(
      success: () {
        state = state.copyWith(step: OnboardingStep.role, otpVerified: true, isSubmitting: false);
        unawaited(_persist());
        return true;
      },
      invalid: () {
        state = state.copyWith(isSubmitting: false, errorMessage: 'Неверный код');
        return false;
      },
      expired: () {
        state = state.copyWith(isSubmitting: false, errorMessage: 'Код истёк, запросите новый');
        return false;
      },
      networkError: () {
        state = state.copyWith(isSubmitting: false, errorMessage: 'Ошибка сети, попробуйте снова');
        return false;
      },
    );
  }

  void selectRole(UserRole role) {
    state = state.copyWith(selectedRole: role);
  }

  /// Role screen's "Продолжить". Clears the resume-after-kill checkpoint —
  /// once onboarding is complete there's nothing left to resume.
  ///
  /// KNOWN GAP (docs/CHANGELOG.md, flagged for the owner): this does NOT
  /// yet write into `currentUserRoleProvider` (shared/domain/
  /// current_role_provider.dart), which stays hardcoded to `UserRole.client`
  /// per its stage-1.5 stub doc comment. Wiring the real selected role into
  /// the app's session/role state needs `SessionState`, which is part of
  /// the not-yet-started full auth pass — see [AuthRepository]. Until then,
  /// an Attorney who finishes onboarding still sees the Client-flavored
  /// bottom nav.
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
