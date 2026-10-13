// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_upload_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateUploadSettingsDto _$UpdateUploadSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateUploadSettingsDto(
  places: (json['places'] as List<dynamic>)
      .map((e) => UploadPlaceLimitsDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$UpdateUploadSettingsDtoToJson(
  UpdateUploadSettingsDto instance,
) => <String, dynamic>{
  'places': instance.places.map((e) => e.toJson()).toList(),
};
