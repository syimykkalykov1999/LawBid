// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'blocked_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BlockedUserDto _$BlockedUserDtoFromJson(Map<String, dynamic> json) =>
    BlockedUserDto(
      id: json['id'] as String,
      role: PersonRole.fromJson(json['role'] as String),
      username: json['username'] as String?,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      blockedAt: json['blockedAt'] as String,
    );

Map<String, dynamic> _$BlockedUserDtoToJson(BlockedUserDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'role': instance.role.toJson(),
      'username': ?instance.username,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'avatarUrl': ?instance.avatarUrl,
      'blockedAt': instance.blockedAt,
    };
