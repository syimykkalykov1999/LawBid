// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'send_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SendMessageDto _$SendMessageDtoFromJson(Map<String, dynamic> json) =>
    SendMessageDto(
      clientMessageId: json['clientMessageId'] as String,
      ciphertext: json['ciphertext'] as String?,
      mlsEpoch: (json['mlsEpoch'] as num?)?.toInt(),
      mlsDeviceId: json['mlsDeviceId'] as String?,
      frankingTag: json['frankingTag'] as String?,
      giftId: json['giftId'] as String?,
      contactUserId: json['contactUserId'] as String?,
      postId: json['postId'] as String?,
      stickerId: json['stickerId'] as String?,
      fileName: json['fileName'] as String?,
      replyToId: json['replyToId'] as String?,
      forwardFromId: json['forwardFromId'] as String?,
      forwarded: json['forwarded'] as bool?,
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
      'ciphertext': ?instance.ciphertext,
      'mlsEpoch': ?instance.mlsEpoch,
      'mlsDeviceId': ?instance.mlsDeviceId,
      'frankingTag': ?instance.frankingTag,
      'giftId': ?instance.giftId,
      'contactUserId': ?instance.contactUserId,
      'postId': ?instance.postId,
      'stickerId': ?instance.stickerId,
      'fileName': ?instance.fileName,
      'replyToId': ?instance.replyToId,
      'forwardFromId': ?instance.forwardFromId,
      'forwarded': ?instance.forwarded,
      'body': ?instance.body,
      'fileId': ?instance.fileId,
      'durationMs': ?instance.durationMs,
      'waveform': ?instance.waveform,
    };
