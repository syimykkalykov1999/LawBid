// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_end_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineEndEnvelope _$HotlineEndEnvelopeFromJson(Map<String, dynamic> json) =>
    HotlineEndEnvelope(
      data: HotlineEndDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$HotlineEndEnvelopeToJson(HotlineEndEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
