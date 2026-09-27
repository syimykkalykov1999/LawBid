// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bootstrap_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BootstrapEnvelope _$BootstrapEnvelopeFromJson(Map<String, dynamic> json) =>
    BootstrapEnvelope(
      data: BootstrapDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BootstrapEnvelopeToJson(BootstrapEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
