// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MeDto _$MeDtoFromJson(Map<String, dynamic> json) => MeDto(
  id: json['id'] as String,
  role: json['role'] == null ? null : UserRole.fromJson(json['role'] as String),
  status: UserStatus.fromJson(json['status'] as String),
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  email: json['email'] as String?,
  emailVerified: json['emailVerified'] as bool,
  phone: json['phone'] as String?,
  phoneVerified: json['phoneVerified'] as bool,
  uiLanguage: json['uiLanguage'] as String,
  theme: ThemePref.fromJson(json['theme'] as String),
  requiredConsentsGranted: json['requiredConsentsGranted'] as bool,
  onboarding: OnboardingStateDto.fromJson(
    json['onboarding'] as Map<String, dynamic>,
  ),
  profile: json['profile'] == null
      ? null
      : MeProfileDto.fromJson(json['profile'] as Map<String, dynamic>),
  missing: (json['missing'] as List<dynamic>)
      .map((e) => MissingRequirement.fromJson(e as String))
      .toList(),
);

Map<String, dynamic> _$MeDtoToJson(MeDto instance) => <String, dynamic>{
  'id': instance.id,
  'role': ?instance.role?.toJson(),
  'status': instance.status.toJson(),
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'email': ?instance.email,
  'emailVerified': instance.emailVerified,
  'phone': ?instance.phone,
  'phoneVerified': instance.phoneVerified,
  'uiLanguage': instance.uiLanguage,
  'theme': instance.theme.toJson(),
  'requiredConsentsGranted': instance.requiredConsentsGranted,
  'onboarding': instance.onboarding.toJson(),
  'profile': ?instance.profile?.toJson(),
  'missing': instance.missing.map((e) => e.toJson()).toList(),
};
