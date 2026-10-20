// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMessageDto _$GroupMessageDtoFromJson(
  Map<String, dynamic> json,
) => GroupMessageDto(
  id: json['id'] as String,
  groupId: json['groupId'] as String,
  type: GroupMessageDtoType.fromJson(json['type'] as String),
  body: json['body'] as String,
  mine: json['mine'] as bool,
  clientMessageId: json['clientMessageId'] as String,
  mentions: (json['mentions'] as List<dynamic>)
      .map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  mentionsMe: json['mentionsMe'] as bool,
  deleted: json['deleted'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  topicId: json['topicId'] as String?,
  sender: json['sender'] == null
      ? null
      : GroupPersonDto.fromJson(json['sender'] as Map<String, dynamic>),
  systemKind: json['systemKind'] as String?,
  systemPeople: (json['systemPeople'] as List<dynamic>?)
      ?.map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  systemText: json['systemText'] as String?,
  replyTo: json['replyTo'] == null
      ? null
      : GroupReplyPreviewDto.fromJson(json['replyTo'] as Map<String, dynamic>),
  attachment: json['attachment'] == null
      ? null
      : ChatAttachmentDto.fromJson(json['attachment'] as Map<String, dynamic>),
  poll: json['poll'] == null
      ? null
      : PollDto.fromJson(json['poll'] as Map<String, dynamic>),
  editedAt: json['editedAt'] == null
      ? null
      : DateTime.parse(json['editedAt'] as String),
);

Map<String, dynamic> _$GroupMessageDtoToJson(GroupMessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'groupId': instance.groupId,
      'topicId': ?instance.topicId,
      'type': instance.type.toJson(),
      'sender': ?instance.sender?.toJson(),
      'body': instance.body,
      'mine': instance.mine,
      'clientMessageId': instance.clientMessageId,
      'systemKind': ?instance.systemKind,
      'systemPeople': ?instance.systemPeople?.map((e) => e.toJson()).toList(),
      'systemText': ?instance.systemText,
      'replyTo': ?instance.replyTo?.toJson(),
      'mentions': instance.mentions.map((e) => e.toJson()).toList(),
      'mentionsMe': instance.mentionsMe,
      'attachment': ?instance.attachment?.toJson(),
      'poll': ?instance.poll?.toJson(),
      'editedAt': ?instance.editedAt?.toIso8601String(),
      'deleted': instance.deleted,
      'createdAt': instance.createdAt.toIso8601String(),
    };
