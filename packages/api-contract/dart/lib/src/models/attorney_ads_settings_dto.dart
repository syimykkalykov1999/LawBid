// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'state_ad_rules_dto.dart';

part 'attorney_ads_settings_dto.g.dart';

@JsonSerializable()
class AttorneyAdsSettingsDto {
  const AttorneyAdsSettingsDto({
    required this.defaults,
    required this.states,
    required this.paidPlacementLabel,
  });

  factory AttorneyAdsSettingsDto.fromJson(Map<String, Object?> json) =>
      _$AttorneyAdsSettingsDtoFromJson(json);

  final StateAdRulesDto defaults;

  /// Per-state overrides by 2-letter code (NY, NJ, ...).
  final dynamic states;
  final bool paidPlacementLabel;

  Map<String, Object?> toJson() => _$AttorneyAdsSettingsDtoToJson(this);
}
