// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'onboarding_profile_dto.dart';
import 'save_onboarding_step_dto_current_step.dart';

part 'save_onboarding_step_dto.g.dart';

@JsonSerializable()
class SaveOnboardingStepDto {
  const SaveOnboardingStepDto({
    required this.currentStep,
    this.data,
    this.profile,
  });

  factory SaveOnboardingStepDto.fromJson(Map<String, Object?> json) =>
      _$SaveOnboardingStepDtoFromJson(json);

  final SaveOnboardingStepDtoCurrentStep currentStep;

  /// Free-form step-local UI data. Merged, not replaced. Profile fields.
  /// belong in [profile], which lands in client_profiles /.
  /// attorney_profiles.
  final dynamic data;

  /// The profile step's structured fields (docs/01 §11 3A/3B), upserted.
  /// into the role's profile table in the same transaction as the step.
  final OnboardingProfileDto? profile;

  Map<String, Object?> toJson() => _$SaveOnboardingStepDtoToJson(this);
}
