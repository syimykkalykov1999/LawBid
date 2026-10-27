// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_setting_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionSettingEnvelope _$PromotionSettingEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionSettingEnvelope(
  data: PromotionSettingDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionSettingEnvelopeToJson(
  PromotionSettingEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
