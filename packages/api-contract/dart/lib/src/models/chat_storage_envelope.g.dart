// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_storage_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChatStorageEnvelope _$ChatStorageEnvelopeFromJson(Map<String, dynamic> json) =>
    ChatStorageEnvelope(
      data: ChatStorageDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ChatStorageEnvelopeToJson(
  ChatStorageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
