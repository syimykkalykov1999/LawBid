// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_member_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMemberDto _$GroupMemberDtoFromJson(Map<String, dynamic> json) =>
    GroupMemberDto(
      userId: json['userId'] as String,
      kind: GroupMemberDtoKind.fromJson(json['kind'] as String),
      verifiedBadge: json['verifiedBadge'] as bool,
      role: GroupRole.fromJson(json['role'] as String),
      joinedAt: DateTime.parse(json['joinedAt'] as String),
      displayName: json['displayName'] as String?,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$GroupMemberDtoToJson(GroupMemberDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'displayName': ?instance.displayName,
      'username': ?instance.username,
      'avatarUrl': ?instance.avatarUrl,
      'kind': instance.kind.toJson(),
      'verifiedBadge': instance.verifiedBadge,
      'role': instance.role.toJson(),
      'joinedAt': instance.joinedAt.toIso8601String(),
    };
