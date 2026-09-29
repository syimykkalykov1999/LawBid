// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryDetailEnvelope _$CaseHistoryDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseHistoryDetailEnvelope(
  data: CaseHistoryDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseHistoryDetailEnvelopeToJson(
  CaseHistoryDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
