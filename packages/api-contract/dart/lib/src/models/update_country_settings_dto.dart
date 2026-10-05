// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_country_settings_dto.g.dart';

@JsonSerializable()
class UpdateCountrySettingsDto {
  const UpdateCountrySettingsDto({this.notifyWaitlist});

  factory UpdateCountrySettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCountrySettingsDtoFromJson(json);

  final bool? notifyWaitlist;

  Map<String, Object?> toJson() => _$UpdateCountrySettingsDtoToJson(this);
}
