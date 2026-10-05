// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerSettingsEnvelope _$PartnerSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PartnerSettingsEnvelope(
  data: PartnerSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PartnerSettingsEnvelopeToJson(
  PartnerSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
