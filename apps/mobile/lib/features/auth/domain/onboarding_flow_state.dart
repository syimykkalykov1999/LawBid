import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/shared/domain/user_role.dart';

part 'onboarding_flow_state.freezed.dart';

/// Sign-in channel of the OTP flow (file 01 §10.2 C-F).
enum AuthChannel {
  phone,
  email;

  String get wireName => name;
}

/// State shared by the pre-session sign-in screens (welcome → phone|email
/// → otp) and the role step's local selection. One notifier for the whole
/// flow: the identifier typed on the phone/email screen is shown on the
/// code screen ("Мы отправили его на {phone}").
///
/// Stage 1.7 mobile: resume-after-restart is SERVER-driven now
/// (`onboarding.currentStep` via AppRouterGuard), so nothing here is
/// persisted locally any more.
@freezed
abstract class OnboardingFlowState with _$OnboardingFlowState {
  const factory OnboardingFlowState({
    @Default(OnboardingStep.welcome) OnboardingStep step,
    @Default(AuthChannel.phone) AuthChannel channel,

    /// E.164 phone or email the code was sent to.
    String? identifier,
    UserRole? selectedRole,
    @Default(false) bool isSubmitting,
    String? errorMessage,

    /// A code that arrived by itself — Android SMS Retriever (§10.2 D) —
    /// shown prefilled on the code
    /// screen while the flow verifies it. Null for a typed code.
    String? autofilledCode,
  }) = _OnboardingFlowState;
}
