// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_attorney_ads_settings_dto.g.dart';

@JsonSerializable()
class UpdateAttorneyAdsSettingsDto {
  const UpdateAttorneyAdsSettingsDto({
    this.defaults,
    this.states,
    this.paidPlacementLabel,
  });

  factory UpdateAttorneyAdsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateAttorneyAdsSettingsDtoFromJson(json);

  final dynamic defaults;

  /// Replaces the per-state overrides: {"NY": {"mode": "warn", ...}}.
  final dynamic states;
  final bool? paidPlacementLabel;

  Map<String, Object?> toJson() => _$UpdateAttorneyAdsSettingsDtoToJson(this);
}
