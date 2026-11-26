// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_preview_key_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PushPreviewKeyDto _$PushPreviewKeyDtoFromJson(Map<String, dynamic> json) =>
    PushPreviewKeyDto(
      userId: json['userId'] as String,
      keyId: json['keyId'] as String,
      publicKey: json['publicKey'] as String,
    );

Map<String, dynamic> _$PushPreviewKeyDtoToJson(PushPreviewKeyDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'keyId': instance.keyId,
      'publicKey': instance.publicKey,
    };
