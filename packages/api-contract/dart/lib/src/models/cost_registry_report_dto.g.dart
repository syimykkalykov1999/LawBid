// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_registry_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostRegistryReportDto _$CostRegistryReportDtoFromJson(
  Map<String, dynamic> json,
) => CostRegistryReportDto(
  generatedAt: json['generatedAt'] as String,
  spendRefreshedAt: json['spendRefreshedAt'] as String?,
  rows: (json['rows'] as List<dynamic>)
      .map((e) => CostRegistryRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  unclaimed: (json['unclaimed'] as List<dynamic>)
      .map((e) => CostRegistryUnclaimedDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  ladder: CostLadderDto.fromJson(json['ladder'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CostRegistryReportDtoToJson(
  CostRegistryReportDto instance,
) => <String, dynamic>{
  'generatedAt': instance.generatedAt,
  'spendRefreshedAt': ?instance.spendRefreshedAt,
  'rows': instance.rows.map((e) => e.toJson()).toList(),
  'unclaimed': instance.unclaimed.map((e) => e.toJson()).toList(),
  'ladder': instance.ladder.toJson(),
};
