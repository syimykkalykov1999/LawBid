// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_ok_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuOkEnvelope _$SfuOkEnvelopeFromJson(Map<String, dynamic> json) =>
    SfuOkEnvelope(
      data: SfuOkDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SfuOkEnvelopeToJson(SfuOkEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
