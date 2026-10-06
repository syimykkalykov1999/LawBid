// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_banner_text_dto.dart';

part 'demo_settings_dto.g.dart';

@JsonSerializable()
class DemoSettingsDto {
  const DemoSettingsDto({
    required this.enabled,
    required this.ttlDays,
    required this.maxAccountsPerPartner,
    required this.autoClean,
    required this.uploadQuotaMb,
    required this.bannerText,
  });

  factory DemoSettingsDto.fromJson(Map<String, Object?> json) =>
      _$DemoSettingsDtoFromJson(json);

  final bool enabled;
  final num ttlDays;
  final num maxAccountsPerPartner;
  final bool autoClean;
  final num uploadQuotaMb;
  final DemoBannerTextDto bannerText;

  Map<String, Object?> toJson() => _$DemoSettingsDtoToJson(this);
}
