// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_onboarding_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveOnboardingStepDto _$SaveOnboardingStepDtoFromJson(
  Map<String, dynamic> json,
) => SaveOnboardingStepDto(
  currentStep: SaveOnboardingStepDtoCurrentStep.fromJson(
    json['currentStep'] as String,
  ),
  data: json['data'],
  profile: json['profile'] == null
      ? null
      : OnboardingProfileDto.fromJson(json['profile'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SaveOnboardingStepDtoToJson(
  SaveOnboardingStepDto instance,
) => <String, dynamic>{
  'currentStep': instance.currentStep.toJson(),
  'data': ?instance.data,
  'profile': ?instance.profile?.toJson(),
};
