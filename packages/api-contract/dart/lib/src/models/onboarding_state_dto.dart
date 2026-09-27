// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'onboarding_state_dto.g.dart';

@JsonSerializable()
class OnboardingStateDto {
  const OnboardingStateDto({
    required this.currentStep,
    required this.completedAt,
    required this.data,
  });

  factory OnboardingStateDto.fromJson(Map<String, Object?> json) =>
      _$OnboardingStateDtoFromJson(json);

  /// Last saved onboarding step (SaveOnboardingStepDto.currentStep).
  final String? currentStep;
  final DateTime? completedAt;

  /// Free-form step-local UI data, merged on every PATCH (always a JSON object: SaveOnboardingStepDto.data is @IsObject).
  final dynamic data;

  Map<String, Object?> toJson() => _$OnboardingStateDtoToJson(this);
}
