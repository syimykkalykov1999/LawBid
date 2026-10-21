// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_message_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMessageListEnvelope _$GroupMessageListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupMessageListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupMessageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupMessageListEnvelopeToJson(
  GroupMessageListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
