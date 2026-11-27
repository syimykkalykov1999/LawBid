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
      durationMs: (json['durationMs'] as num?)?.toInt(),
      waveform: (json['waveform'] as List<dynamic>?)
          ?.map((e) => (e as num).toInt())
          .toList(),
      ciphertext: json['ciphertext'] as String?,
      mlsEpoch: (json['mlsEpoch'] as num?)?.toInt(),
      mlsDeviceId: json['mlsDeviceId'] as String?,
      frankingTag: json['frankingTag'] as String?,
      control: json['control'] as bool?,
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
  'durationMs': ?instance.durationMs,
  'waveform': ?instance.waveform,
  'ciphertext': ?instance.ciphertext,
  'mlsEpoch': ?instance.mlsEpoch,
  'mlsDeviceId': ?instance.mlsDeviceId,
  'frankingTag': ?instance.frankingTag,
  'control': ?instance.control,
};
