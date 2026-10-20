// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'send_group_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SendGroupMessageDto _$SendGroupMessageDtoFromJson(Map<String, dynamic> json) =>
    SendGroupMessageDto(
      clientMessageId: json['clientMessageId'] as String,
      type: SendGroupMessageDtoType.fromJson(json['type'] as String),
      body: json['body'] as String?,
      topicId: json['topicId'] as String?,
      replyToId: json['replyToId'] as String?,
      mentionIds: (json['mentionIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      fileId: json['fileId'] as String?,
      fileName: json['fileName'] as String?,
    );

Map<String, dynamic> _$SendGroupMessageDtoToJson(
  SendGroupMessageDto instance,
) => <String, dynamic>{
  'clientMessageId': instance.clientMessageId,
  'type': instance.type.toJson(),
  'body': ?instance.body,
  'topicId': ?instance.topicId,
  'replyToId': ?instance.replyToId,
  'mentionIds': ?instance.mentionIds,
  'fileId': ?instance.fileId,
  'fileName': ?instance.fileName,
};
