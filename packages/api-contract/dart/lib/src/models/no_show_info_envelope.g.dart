// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'no_show_info_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NoShowInfoEnvelope _$NoShowInfoEnvelopeFromJson(Map<String, dynamic> json) =>
    NoShowInfoEnvelope(
      data: NoShowInfoDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$NoShowInfoEnvelopeToJson(NoShowInfoEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
