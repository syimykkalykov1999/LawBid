// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'experiment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExperimentListEnvelope _$ExperimentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ExperimentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ExperimentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ExperimentListEnvelopeToJson(
  ExperimentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
