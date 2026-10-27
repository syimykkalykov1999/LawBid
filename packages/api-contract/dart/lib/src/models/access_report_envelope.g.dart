// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'access_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AccessReportEnvelope _$AccessReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => AccessReportEnvelope(
  data: AccessReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AccessReportEnvelopeToJson(
  AccessReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
