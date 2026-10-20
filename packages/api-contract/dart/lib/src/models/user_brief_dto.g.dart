// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_brief_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserBriefDto _$UserBriefDtoFromJson(Map<String, dynamic> json) => UserBriefDto(
  id: json['id'] as String,
  role: UserBriefDtoRole.fromJson(json['role'] as String),
  username: json['username'] as String,
  verifiedBadge: json['verifiedBadge'] as bool,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$UserBriefDtoToJson(UserBriefDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'role': instance.role.toJson(),
      'username': instance.username,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'avatarUrl': ?instance.avatarUrl,
      'verifiedBadge': instance.verifiedBadge,
    };
