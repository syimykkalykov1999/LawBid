// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_message_readers_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMessageReadersEnvelope _$GroupMessageReadersEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupMessageReadersEnvelope(
  data: GroupMessageReadersDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupMessageReadersEnvelopeToJson(
  GroupMessageReadersEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
