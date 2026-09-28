// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateProfileDto _$UpdateProfileDtoFromJson(Map<String, dynamic> json) =>
    UpdateProfileDto(
      avatarFileId: json['avatarFileId'] as String?,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      uiLanguage: json['uiLanguage'] as String?,
      theme: json['theme'] == null
          ? null
          : UpdateProfileDtoTheme.fromJson(json['theme'] as String),
    );

Map<String, dynamic> _$UpdateProfileDtoToJson(UpdateProfileDto instance) =>
    <String, dynamic>{
      'avatarFileId': ?instance.avatarFileId,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'uiLanguage': ?instance.uiLanguage,
      'theme': ?instance.theme?.toJson(),
    };
