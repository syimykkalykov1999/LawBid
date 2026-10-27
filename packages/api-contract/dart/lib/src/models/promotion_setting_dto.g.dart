// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_setting_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionSettingDto _$PromotionSettingDtoFromJson(Map<String, dynamic> json) =>
    PromotionSettingDto(
      key: json['key'] as String,
      type: PromotionSettingDtoType.fromJson(json['type'] as String),
      value: json['value'],
      stored: json['stored'] as bool,
      defaultValue: json['defaultValue'],
    );

Map<String, dynamic> _$PromotionSettingDtoToJson(
  PromotionSettingDto instance,
) => <String, dynamic>{
  'key': instance.key,
  'type': instance.type.toJson(),
  'value': ?instance.value,
  'stored': instance.stored,
  'defaultValue': ?instance.defaultValue,
};
