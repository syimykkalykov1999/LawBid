// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'erasure_record_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ErasureRecordEnvelope _$ErasureRecordEnvelopeFromJson(
  Map<String, dynamic> json,
) => ErasureRecordEnvelope(
  data: ErasureRecordDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ErasureRecordEnvelopeToJson(
  ErasureRecordEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
