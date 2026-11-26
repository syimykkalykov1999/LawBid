// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_device_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsDeviceListEnvelope _$MlsDeviceListEnvelopeFromJson(
  Map<String, dynamic> json,
) => MlsDeviceListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => MlsDeviceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MlsDeviceListEnvelopeToJson(
  MlsDeviceListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
