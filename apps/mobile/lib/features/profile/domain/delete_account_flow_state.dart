import 'package:freezed_annotation/freezed_annotation.dart';

import 'delete_account_step.dart';

part 'delete_account_flow_state.freezed.dart';

/// State for `/profile/settings/delete-account` (file 01 §10.7). One
/// notifier for the whole flow, same reasoning as `OnboardingFlowState`
/// (features/auth/domain/onboarding_flow_state.dart's doc comment): later
/// steps display data collected on earlier ones (the phone number typed in
/// [DeleteAccountStep.reauthPhone] is shown on [DeleteAccountStep.reauthCode]).
///
/// Phase 4 of the auth networking work (docs/CHANGELOG.md).
///
/// NOTE: this file's `.freezed.dart` part was NOT generated as part of
/// this change (no `dart` binary available on this bridge, same as every
/// other freezed type in this codebase) — `dart run build_runner build` is
/// required before this compiles.
@freezed
abstract class DeleteAccountFlowState with _$DeleteAccountFlowState {
  const factory DeleteAccountFlowState({
    @Default(DeleteAccountStep.warning) DeleteAccountStep step,
    @Default(false) bool biometricAvailable,
    String? phoneNumber,
    @Default(false) bool codeRequested,
    String? reauthToken,
    @Default('') String confirmPhraseInput,
    @Default(false) bool isSubmitting,
    String? errorMessage,
  }) = _DeleteAccountFlowState;
}
