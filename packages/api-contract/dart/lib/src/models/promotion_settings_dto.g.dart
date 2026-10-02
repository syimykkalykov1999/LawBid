// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionSettingsDto _$PromotionSettingsDtoFromJson(
  Map<String, dynamic> json,
) => PromotionSettingsDto(
  enabled: json['enabled'] as bool,
  priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
  maxDays: (json['maxDays'] as num).toInt(),
  maxActivePerCase: (json['maxActivePerCase'] as num?)?.toInt() ?? 1,
);

Map<String, dynamic> _$PromotionSettingsDtoToJson(
  PromotionSettingsDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'priceCentsPerDay': instance.priceCentsPerDay,
  'maxDays': instance.maxDays,
  'maxActivePerCase': instance.maxActivePerCase,
};
