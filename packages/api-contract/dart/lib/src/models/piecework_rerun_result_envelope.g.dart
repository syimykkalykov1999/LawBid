// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_rerun_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkRerunResultEnvelope _$PieceworkRerunResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => PieceworkRerunResultEnvelope(
  data: PieceworkRerunResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PieceworkRerunResultEnvelopeToJson(
  PieceworkRerunResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
