// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'csam_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CsamReportEnvelope _$CsamReportEnvelopeFromJson(Map<String, dynamic> json) =>
    CsamReportEnvelope(
      data: CsamReportDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CsamReportEnvelopeToJson(CsamReportEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
