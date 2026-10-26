// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsEnvelope _$AnalyticsEnvelopeFromJson(Map<String, dynamic> json) =>
    AnalyticsEnvelope(
      data: AnalyticsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AnalyticsEnvelopeToJson(AnalyticsEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
