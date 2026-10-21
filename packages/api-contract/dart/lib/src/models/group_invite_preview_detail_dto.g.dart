// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_invite_preview_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupInvitePreviewDetailDto _$GroupInvitePreviewDetailDtoFromJson(
  Map<String, dynamic> json,
) => GroupInvitePreviewDetailDto(
  invite: GroupInviteDto.fromJson(json['invite'] as Map<String, dynamic>),
  readable: json['readable'] as bool,
  members: (json['members'] as List<dynamic>)
      .map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  messages: (json['messages'] as List<dynamic>)
      .map((e) => GroupMessageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  description: json['description'] as String?,
);

Map<String, dynamic> _$GroupInvitePreviewDetailDtoToJson(
  GroupInvitePreviewDetailDto instance,
) => <String, dynamic>{
  'invite': instance.invite.toJson(),
  'description': ?instance.description,
  'readable': instance.readable,
  'members': instance.members.map((e) => e.toJson()).toList(),
  'messages': instance.messages.map((e) => e.toJson()).toList(),
};
