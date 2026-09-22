import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../shared/domain/user_role.dart';
import 'onboarding_step.dart';

part 'onboarding_flow_state.freezed.dart';

/// State shared by all 4 onboarding screens (file 07 §6.5) — one notifier
/// for the whole flow rather than one per screen, since screens genuinely
/// share state: the phone number typed on screen 2 is displayed on screen 3
/// ("Мы отправили его на {phone}"), and "resume after kill" (file 01 §15
/// stage-1.7 acceptance item 4) needs one persisted place, not four. See
/// `OnboardingFlow` (application/onboarding_flow.dart) and the stage-1.7
/// architecture review in docs/CHANGELOG.md.
@freezed
abstract class OnboardingFlowState with _$OnboardingFlowState {
  const factory OnboardingFlowState({
    @Default(OnboardingStep.welcome) OnboardingStep step,
    String? phoneNumber,
    @Default(false) bool otpVerified,
    UserRole? selectedRole,
    @Default(false) bool isSubmitting,
    String? errorMessage,
  }) = _OnboardingFlowState;
}
