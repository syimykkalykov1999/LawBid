// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_ads_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyAdsSettingsEnvelope _$AttorneyAdsSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AttorneyAdsSettingsEnvelope(
  data: AttorneyAdsSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AttorneyAdsSettingsEnvelopeToJson(
  AttorneyAdsSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
