// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scale_extras_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScaleExtrasEnvelope _$ScaleExtrasEnvelopeFromJson(Map<String, dynamic> json) =>
    ScaleExtrasEnvelope(
      data: ScaleExtrasDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ScaleExtrasEnvelopeToJson(
  ScaleExtrasEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
