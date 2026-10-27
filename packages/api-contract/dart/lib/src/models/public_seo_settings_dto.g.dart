// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_seo_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicSeoSettingsDto _$PublicSeoSettingsDtoFromJson(
  Map<String, dynamic> json,
) => PublicSeoSettingsDto(
  incremental: json['incremental'] as bool?,
  sitemapIndex: json['sitemapIndex'] as bool?,
  robotsAi: json['robotsAi'] as bool?,
  llms: json['llms'] as bool?,
  qualityGate: json['qualityGate'] as bool?,
  rampPerDay: json['rampPerDay'] as num?,
);

Map<String, dynamic> _$PublicSeoSettingsDtoToJson(
  PublicSeoSettingsDto instance,
) => <String, dynamic>{
  'incremental': ?instance.incremental,
  'sitemapIndex': ?instance.sitemapIndex,
  'robotsAi': ?instance.robotsAi,
  'llms': ?instance.llms,
  'qualityGate': ?instance.qualityGate,
  'rampPerDay': ?instance.rampPerDay,
};
