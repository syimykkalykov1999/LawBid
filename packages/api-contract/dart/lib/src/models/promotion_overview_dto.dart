// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_checklist_item_dto.dart';
import 'promotion_dry_run_info_dto.dart';
import 'promotion_setting_dto.dart';
import 'promotion_status_dto.dart';

part 'promotion_overview_dto.g.dart';

@JsonSerializable()
class PromotionOverviewDto {
  const PromotionOverviewDto({
    required this.switches,
    required this.checklist,
    required this.status,
    required this.dryRun,
  });

  factory PromotionOverviewDto.fromJson(Map<String, Object?> json) =>
      _$PromotionOverviewDtoFromJson(json);

  final List<PromotionSettingDto> switches;
  final List<PromotionChecklistItemDto> checklist;
  final PromotionStatusDto status;
  final PromotionDryRunInfoDto dryRun;

  Map<String, Object?> toJson() => _$PromotionOverviewDtoToJson(this);
}
