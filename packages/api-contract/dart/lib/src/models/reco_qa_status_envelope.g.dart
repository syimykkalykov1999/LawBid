// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reco_qa_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecoQaStatusEnvelope _$RecoQaStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => RecoQaStatusEnvelope(
  data: RecoQaStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RecoQaStatusEnvelopeToJson(
  RecoQaStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
