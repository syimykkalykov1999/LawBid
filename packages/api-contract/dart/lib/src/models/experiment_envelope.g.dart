// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'experiment_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExperimentEnvelope _$ExperimentEnvelopeFromJson(Map<String, dynamic> json) =>
    ExperimentEnvelope(
      data: ExperimentDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ExperimentEnvelopeToJson(ExperimentEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
