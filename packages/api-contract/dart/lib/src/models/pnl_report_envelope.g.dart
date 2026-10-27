// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pnl_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PnlReportEnvelope _$PnlReportEnvelopeFromJson(Map<String, dynamic> json) =>
    PnlReportEnvelope(
      data: PnlReportDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PnlReportEnvelopeToJson(PnlReportEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
