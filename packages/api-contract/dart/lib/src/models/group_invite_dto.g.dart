// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInviteDto _$GroupInviteDtoFromJson(Map<String, dynamic> json) =>
    GroupInviteDto(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      title: json['title'] as String,
      memberCount: json['memberCount'] as num,
      type: GroupType.fromJson(json['type'] as String),
      inviter: GroupPersonDto.fromJson(json['inviter'] as Map<String, dynamic>),
      createdAt: DateTime.parse(json['createdAt'] as String),
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$GroupInviteDtoToJson(GroupInviteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'groupId': instance.groupId,
      'title': instance.title,
      'avatarUrl': ?instance.avatarUrl,
      'memberCount': instance.memberCount,
      'type': instance.type.toJson(),
      'inviter': instance.inviter.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
