// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'recompute_all_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecomputeAllResultEnvelope _$RecomputeAllResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => RecomputeAllResultEnvelope(
  data: RecomputeAllResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RecomputeAllResultEnvelopeToJson(
  RecomputeAllResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
