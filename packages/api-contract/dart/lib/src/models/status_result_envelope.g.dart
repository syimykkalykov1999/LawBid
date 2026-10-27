// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'status_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StatusResultEnvelope _$StatusResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StatusResultEnvelope(
  data: StatusResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StatusResultEnvelopeToJson(
  StatusResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
