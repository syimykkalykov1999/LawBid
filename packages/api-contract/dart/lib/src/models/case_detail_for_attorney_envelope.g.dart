// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_detail_for_attorney_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseDetailForAttorneyEnvelope _$CaseDetailForAttorneyEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseDetailForAttorneyEnvelope(
  data: CaseDetailForAttorneyDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseDetailForAttorneyEnvelopeToJson(
  CaseDetailForAttorneyEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
