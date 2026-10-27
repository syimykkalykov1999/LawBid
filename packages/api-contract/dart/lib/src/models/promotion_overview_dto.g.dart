// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionOverviewDto _$PromotionOverviewDtoFromJson(
  Map<String, dynamic> json,
) => PromotionOverviewDto(
  switches: (json['switches'] as List<dynamic>)
      .map((e) => PromotionSettingDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  checklist: (json['checklist'] as List<dynamic>)
      .map((e) => PromotionChecklistItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  status: PromotionStatusDto.fromJson(json['status'] as Map<String, dynamic>),
  dryRun: PromotionDryRunInfoDto.fromJson(
    json['dryRun'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$PromotionOverviewDtoToJson(
  PromotionOverviewDto instance,
) => <String, dynamic>{
  'switches': instance.switches.map((e) => e.toJson()).toList(),
  'checklist': instance.checklist.map((e) => e.toJson()).toList(),
  'status': instance.status.toJson(),
  'dryRun': instance.dryRun.toJson(),
};
