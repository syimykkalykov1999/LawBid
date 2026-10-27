// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_dispute_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkDisputeResultEnvelope _$PieceworkDisputeResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => PieceworkDisputeResultEnvelope(
  data: PieceworkDisputeResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PieceworkDisputeResultEnvelopeToJson(
  PieceworkDisputeResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
