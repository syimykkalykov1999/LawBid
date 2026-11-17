// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_config_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineConfigEnvelope _$HotlineConfigEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineConfigEnvelope(
  data: HotlineConfigDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineConfigEnvelopeToJson(
  HotlineConfigEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
