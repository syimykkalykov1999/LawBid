// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_ads_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyAdsSettingsDto _$AttorneyAdsSettingsDtoFromJson(
  Map<String, dynamic> json,
) => AttorneyAdsSettingsDto(
  defaults: StateAdRulesDto.fromJson(json['defaults'] as Map<String, dynamic>),
  states: json['states'],
  paidPlacementLabel: json['paidPlacementLabel'] as bool,
);

Map<String, dynamic> _$AttorneyAdsSettingsDtoToJson(
  AttorneyAdsSettingsDto instance,
) => <String, dynamic>{
  'defaults': instance.defaults.toJson(),
  'states': ?instance.states,
  'paidPlacementLabel': instance.paidPlacementLabel,
};
