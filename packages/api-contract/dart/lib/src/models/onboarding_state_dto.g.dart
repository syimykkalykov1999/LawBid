// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'onboarding_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OnboardingStateDto _$OnboardingStateDtoFromJson(Map<String, dynamic> json) =>
    OnboardingStateDto(
      currentStep: json['currentStep'] as String?,
      completedAt: json['completedAt'] == null
          ? null
          : DateTime.parse(json['completedAt'] as String),
      data: json['data'],
    );

Map<String, dynamic> _$OnboardingStateDtoToJson(OnboardingStateDto instance) =>
    <String, dynamic>{
      'currentStep': ?instance.currentStep,
      'completedAt': ?instance.completedAt?.toIso8601String(),
      'data': ?instance.data,
    };
