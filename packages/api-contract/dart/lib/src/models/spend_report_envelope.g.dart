// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'spend_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SpendReportEnvelope _$SpendReportEnvelopeFromJson(Map<String, dynamic> json) =>
    SpendReportEnvelope(
      data: SpendReportDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SpendReportEnvelopeToJson(
  SpendReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
