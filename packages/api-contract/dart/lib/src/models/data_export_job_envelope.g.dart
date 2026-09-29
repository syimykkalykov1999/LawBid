// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_export_job_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataExportJobEnvelope _$DataExportJobEnvelopeFromJson(
  Map<String, dynamic> json,
) => DataExportJobEnvelope(
  data: DataExportJobDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DataExportJobEnvelopeToJson(
  DataExportJobEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
