// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoSettingsEnvelope _$DemoSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => DemoSettingsEnvelope(
  data: DemoSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DemoSettingsEnvelopeToJson(
  DemoSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
