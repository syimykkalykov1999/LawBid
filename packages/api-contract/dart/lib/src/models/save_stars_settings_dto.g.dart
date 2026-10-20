// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_stars_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveStarsSettingsDto _$SaveStarsSettingsDtoFromJson(
  Map<String, dynamic> json,
) => SaveStarsSettingsDto(
  packs: (json['packs'] as List<dynamic>)
      .map((e) => StarPackDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  giftConvertPercent: (json['giftConvertPercent'] as num).toInt(),
  giftsPerDayMax: (json['giftsPerDayMax'] as num).toInt(),
);

Map<String, dynamic> _$SaveStarsSettingsDtoToJson(
  SaveStarsSettingsDto instance,
) => <String, dynamic>{
  'packs': instance.packs.map((e) => e.toJson()).toList(),
  'giftConvertPercent': instance.giftConvertPercent,
  'giftsPerDayMax': instance.giftsPerDayMax,
};
