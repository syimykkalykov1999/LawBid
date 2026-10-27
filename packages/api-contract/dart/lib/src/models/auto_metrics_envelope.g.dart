// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auto_metrics_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoMetricsEnvelope _$AutoMetricsEnvelopeFromJson(Map<String, dynamic> json) =>
    AutoMetricsEnvelope(
      data: AutoMetricsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AutoMetricsEnvelopeToJson(
  AutoMetricsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
