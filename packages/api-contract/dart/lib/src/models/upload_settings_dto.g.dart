// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upload_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UploadSettingsDto _$UploadSettingsDtoFromJson(Map<String, dynamic> json) =>
    UploadSettingsDto(
      places: (json['places'] as List<dynamic>)
          .map((e) => UploadPlaceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$UploadSettingsDtoToJson(UploadSettingsDto instance) =>
    <String, dynamic>{
      'places': instance.places.map((e) => e.toJson()).toList(),
    };
