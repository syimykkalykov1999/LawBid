// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInvitePreviewDto _$GroupInvitePreviewDtoFromJson(
  Map<String, dynamic> json,
) => GroupInvitePreviewDto(
  id: json['id'] as String,
  code: json['code'] as String,
  type: GroupType.fromJson(json['type'] as String),
  requiresApproval: json['requiresApproval'] as bool,
  requestPending: json['requestPending'] as bool,
  title: json['title'] as String,
  memberCount: json['memberCount'] as num,
  alreadyMember: json['alreadyMember'] as bool,
  username: json['username'] as String?,
  description: json['description'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  mutualCount: json['mutualCount'] as num?,
);

Map<String, dynamic> _$GroupInvitePreviewDtoToJson(
  GroupInvitePreviewDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'code': instance.code,
  'type': instance.type.toJson(),
  'username': ?instance.username,
  'requiresApproval': instance.requiresApproval,
  'requestPending': instance.requestPending,
  'title': instance.title,
  'description': ?instance.description,
  'avatarUrl': ?instance.avatarUrl,
  'memberCount': instance.memberCount,
  'alreadyMember': instance.alreadyMember,
  'mutualCount': ?instance.mutualCount,
};
