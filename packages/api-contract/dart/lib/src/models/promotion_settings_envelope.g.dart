// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionSettingsEnvelope _$PromotionSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionSettingsEnvelope(
  data: PromotionSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionSettingsEnvelopeToJson(
  PromotionSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
