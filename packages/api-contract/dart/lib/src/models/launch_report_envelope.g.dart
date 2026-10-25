// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'launch_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LaunchReportEnvelope _$LaunchReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => LaunchReportEnvelope(
  data: LaunchReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LaunchReportEnvelopeToJson(
  LaunchReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
