// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_request_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantRequestListEnvelope _$AssistantRequestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AssistantRequestListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AssistantRequestDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AssistantRequestListEnvelopeToJson(
  AssistantRequestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
