// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'upload_place_dto.dart';

part 'upload_settings_dto.g.dart';

@JsonSerializable()
class UploadSettingsDto {
  const UploadSettingsDto({
    required this.places,
  });
  
  factory UploadSettingsDto.fromJson(Map<String, Object?> json) => _$UploadSettingsDtoFromJson(json);
  
  final List<UploadPlaceDto> places;

  Map<String, Object?> toJson() => _$UploadSettingsDtoToJson(this);
}
