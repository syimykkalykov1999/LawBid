// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_request_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraRequestEnvelope _$InfraRequestEnvelopeFromJson(
  Map<String, dynamic> json,
) => InfraRequestEnvelope(
  data: InfraRequestDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$InfraRequestEnvelopeToJson(
  InfraRequestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
