// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'economy_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EconomyReportEnvelope _$EconomyReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => EconomyReportEnvelope(
  data: EconomyReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$EconomyReportEnvelopeToJson(
  EconomyReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
