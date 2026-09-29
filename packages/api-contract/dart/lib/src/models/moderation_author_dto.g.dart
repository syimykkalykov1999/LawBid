// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_author_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationAuthorDto _$ModerationAuthorDtoFromJson(Map<String, dynamic> json) =>
    ModerationAuthorDto(
      id: json['id'] as String,
      role: json['role'] as String?,
      status: json['status'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      username: json['username'] as String?,
      warnings: (json['warnings'] as num).toInt(),
      suspensions: (json['suspensions'] as num).toInt(),
    );

Map<String, dynamic> _$ModerationAuthorDtoToJson(
  ModerationAuthorDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'role': ?instance.role,
  'status': instance.status,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'username': ?instance.username,
  'warnings': instance.warnings,
  'suspensions': instance.suspensions,
};
