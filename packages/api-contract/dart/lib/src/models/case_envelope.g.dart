// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseEnvelope _$CaseEnvelopeFromJson(Map<String, dynamic> json) => CaseEnvelope(
  data: CaseDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseEnvelopeToJson(CaseEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
