// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_attorney_ads_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateAttorneyAdsSettingsDto _$UpdateAttorneyAdsSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateAttorneyAdsSettingsDto(
  defaults: json['defaults'],
  states: json['states'],
  paidPlacementLabel: json['paidPlacementLabel'] as bool?,
);

Map<String, dynamic> _$UpdateAttorneyAdsSettingsDtoToJson(
  UpdateAttorneyAdsSettingsDto instance,
) => <String, dynamic>{
  'defaults': ?instance.defaults,
  'states': ?instance.states,
  'paidPlacementLabel': ?instance.paidPlacementLabel,
};
