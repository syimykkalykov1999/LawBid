// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_export_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryExportEnvelope _$CaseHistoryExportEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseHistoryExportEnvelope(
  data: CaseHistoryExportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseHistoryExportEnvelopeToJson(
  CaseHistoryExportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
