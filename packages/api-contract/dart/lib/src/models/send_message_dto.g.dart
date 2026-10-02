// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'send_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SendMessageDto _$SendMessageDtoFromJson(Map<String, dynamic> json) =>
    SendMessageDto(
      clientMessageId: json['clientMessageId'] as String,
      stickerId: json['stickerId'] as String?,
      fileName: json['fileName'] as String?,
      body: json['body'] as String?,
      fileId: json['fileId'] as String?,
      durationMs: (json['durationMs'] as num?)?.toInt(),
      waveform: (json['waveform'] as List<dynamic>?)
          ?.map((e) => (e as num).toInt())
          .toList(),
      type: json['type'] == null
          ? SendMessageType.text
          : SendMessageType.fromJson(json['type'] as String),
    );

Map<String, dynamic> _$SendMessageDtoToJson(SendMessageDto instance) =>
    <String, dynamic>{
      'clientMessageId': instance.clientMessageId,
      'type': instance.type.toJson(),
      'stickerId': ?instance.stickerId,
      'fileName': ?instance.fileName,
      'body': ?instance.body,
      'fileId': ?instance.fileId,
      'durationMs': ?instance.durationMs,
      'waveform': ?instance.waveform,
    };
