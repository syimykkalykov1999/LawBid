// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'onboarding_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OnboardingProfileDto _$OnboardingProfileDtoFromJson(
  Map<String, dynamic> json,
) => OnboardingProfileDto(
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  stateCode: json['stateCode'] as String?,
  languages: (json['languages'] as List<dynamic>?)
      ?.map((e) => OnboardingProfileDtoLanguages.fromJson(e as String))
      .toList(),
  contactMethod: json['contactMethod'] == null
      ? null
      : OnboardingProfileDtoContactMethod.fromJson(
          json['contactMethod'] as String,
        ),
  contactNote: json['contactNote'] as String?,
  bio: json['bio'] as String?,
  firmName: json['firmName'] as String?,
  licensedStates: (json['licensedStates'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$OnboardingProfileDtoToJson(
  OnboardingProfileDto instance,
) => <String, dynamic>{
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'stateCode': ?instance.stateCode,
  'languages': ?instance.languages?.map((e) => e.toJson()).toList(),
  'contactMethod': ?instance.contactMethod?.toJson(),
  'contactNote': ?instance.contactNote,
  'bio': ?instance.bio,
  'firmName': ?instance.firmName,
  'licensedStates': ?instance.licensedStates,
};
