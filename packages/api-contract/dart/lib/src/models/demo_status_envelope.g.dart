// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoStatusEnvelope _$DemoStatusEnvelopeFromJson(Map<String, dynamic> json) =>
    DemoStatusEnvelope(
      data: DemoStatusDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DemoStatusEnvelopeToJson(DemoStatusEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
