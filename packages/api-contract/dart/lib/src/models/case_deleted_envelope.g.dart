// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_deleted_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseDeletedEnvelope _$CaseDeletedEnvelopeFromJson(Map<String, dynamic> json) =>
    CaseDeletedEnvelope(
      data: CaseDeletedDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CaseDeletedEnvelopeToJson(
  CaseDeletedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
