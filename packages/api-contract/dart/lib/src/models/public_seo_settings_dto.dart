// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'public_seo_settings_dto.g.dart';

@JsonSerializable()
class PublicSeoSettingsDto {
  const PublicSeoSettingsDto({
    required this.incremental,
    required this.sitemapIndex,
    required this.robotsAi,
    required this.llms,
    required this.qualityGate,
    required this.rampPerDay,
  });

  factory PublicSeoSettingsDto.fromJson(Map<String, Object?> json) =>
      _$PublicSeoSettingsDtoFromJson(json);

  final bool? incremental;
  final bool? sitemapIndex;
  final bool? robotsAi;
  final bool? llms;
  final bool? qualityGate;
  final num? rampPerDay;

  Map<String, Object?> toJson() => _$PublicSeoSettingsDtoToJson(this);
}
