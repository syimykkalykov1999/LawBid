// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'heavy_hitters_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HeavyHittersEnvelope _$HeavyHittersEnvelopeFromJson(
  Map<String, dynamic> json,
) => HeavyHittersEnvelope(
  data: HeavyHittersDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HeavyHittersEnvelopeToJson(
  HeavyHittersEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
