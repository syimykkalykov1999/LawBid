// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_device_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsDeviceEnvelope _$MlsDeviceEnvelopeFromJson(Map<String, dynamic> json) =>
    MlsDeviceEnvelope(
      data: MlsDeviceDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MlsDeviceEnvelopeToJson(MlsDeviceEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
