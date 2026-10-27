// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reporting_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReportingStatusEnvelope _$ReportingStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReportingStatusEnvelope(
  data: ReportingStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReportingStatusEnvelopeToJson(
  ReportingStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
