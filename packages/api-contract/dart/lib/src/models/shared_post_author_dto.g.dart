// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shared_post_author_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SharedPostAuthorDto _$SharedPostAuthorDtoFromJson(Map<String, dynamic> json) =>
    SharedPostAuthorDto(
      id: json['id'] as String,
      role: SharedPostAuthorDtoRole.fromJson(json['role'] as String),
      username: json['username'] as String,
      verifiedBadge: json['verifiedBadge'] as bool,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$SharedPostAuthorDtoToJson(
  SharedPostAuthorDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'role': instance.role.toJson(),
  'username': instance.username,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'avatarUrl': ?instance.avatarUrl,
  'verifiedBadge': instance.verifiedBadge,
};
