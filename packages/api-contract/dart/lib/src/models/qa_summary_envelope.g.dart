// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qa_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QaSummaryEnvelope _$QaSummaryEnvelopeFromJson(Map<String, dynamic> json) =>
    QaSummaryEnvelope(
      data: QaSummaryDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$QaSummaryEnvelopeToJson(QaSummaryEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
