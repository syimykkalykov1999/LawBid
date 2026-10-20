// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_admin_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsAdminSettingsDto _$StarsAdminSettingsDtoFromJson(
  Map<String, dynamic> json,
) => StarsAdminSettingsDto(
  packs: (json['packs'] as List<dynamic>)
      .map((e) => StarPackDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  enabled: json['enabled'] as bool,
  giftConvertPercent: (json['giftConvertPercent'] as num).toInt(),
  giftsPerDayMax: (json['giftsPerDayMax'] as num).toInt(),
);

Map<String, dynamic> _$StarsAdminSettingsDtoToJson(
  StarsAdminSettingsDto instance,
) => <String, dynamic>{
  'packs': instance.packs.map((e) => e.toJson()).toList(),
  'enabled': instance.enabled,
  'giftConvertPercent': instance.giftConvertPercent,
  'giftsPerDayMax': instance.giftsPerDayMax,
};
