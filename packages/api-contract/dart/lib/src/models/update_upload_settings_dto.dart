// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'upload_place_limits_dto.dart';

part 'update_upload_settings_dto.g.dart';

@JsonSerializable()
class UpdateUploadSettingsDto {
  const UpdateUploadSettingsDto({required this.places});

  factory UpdateUploadSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateUploadSettingsDtoFromJson(json);

  final List<UploadPlaceLimitsDto> places;

  Map<String, Object?> toJson() => _$UpdateUploadSettingsDtoToJson(this);
}
