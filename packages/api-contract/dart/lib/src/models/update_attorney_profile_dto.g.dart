// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_attorney_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateAttorneyProfileDto _$UpdateAttorneyProfileDtoFromJson(
  Map<String, dynamic> json,
) => UpdateAttorneyProfileDto(
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  bio: json['bio'] as String?,
  firmName: json['firmName'] as String?,
  languages: (json['languages'] as List<dynamic>?)
      ?.map((e) => UpdateAttorneyProfileDtoLanguages.fromJson(e as String))
      .toList(),
  username: json['username'] as String?,
);

Map<String, dynamic> _$UpdateAttorneyProfileDtoToJson(
  UpdateAttorneyProfileDto instance,
) => <String, dynamic>{
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'bio': ?instance.bio,
  'firmName': ?instance.firmName,
  'languages': ?instance.languages?.map((e) => e.toJson()).toList(),
  'username': ?instance.username,
};
