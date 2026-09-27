// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'me_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MeProfileDto _$MeProfileDtoFromJson(Map<String, dynamic> json) => MeProfileDto(
  languages: (json['languages'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  stateCode: json['stateCode'] as String?,
  contactMethod: json['contactMethod'] == null
      ? null
      : ContactMethod.fromJson(json['contactMethod'] as String),
  contactNote: json['contactNote'] as String?,
  username: json['username'] as String?,
  bio: json['bio'] as String?,
  firmName: json['firmName'] as String?,
  licensedStates: (json['licensedStates'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  verificationStatus: json['verificationStatus'] == null
      ? null
      : VerificationStatus.fromJson(json['verificationStatus'] as String),
);

Map<String, dynamic> _$MeProfileDtoToJson(MeProfileDto instance) =>
    <String, dynamic>{
      'stateCode': ?instance.stateCode,
      'languages': instance.languages,
      'contactMethod': ?instance.contactMethod?.toJson(),
      'contactNote': ?instance.contactNote,
      'username': ?instance.username,
      'bio': ?instance.bio,
      'firmName': ?instance.firmName,
      'licensedStates': ?instance.licensedStates,
      'verificationStatus': ?instance.verificationStatus?.toJson(),
    };
