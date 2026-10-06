// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoMeEnvelope _$DemoMeEnvelopeFromJson(Map<String, dynamic> json) =>
    DemoMeEnvelope(
      data: DemoMeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DemoMeEnvelopeToJson(DemoMeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
