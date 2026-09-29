// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_request_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataRequestListEnvelope _$DataRequestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => DataRequestListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => DataRequestDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DataRequestListEnvelopeToJson(
  DataRequestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
