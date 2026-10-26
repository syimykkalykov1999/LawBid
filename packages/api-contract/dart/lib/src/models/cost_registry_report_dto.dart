// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_ladder_dto.dart';
import 'cost_registry_row_dto.dart';
import 'cost_registry_unclaimed_dto.dart';

part 'cost_registry_report_dto.g.dart';

@JsonSerializable()
class CostRegistryReportDto {
  const CostRegistryReportDto({
    required this.generatedAt,
    required this.spendRefreshedAt,
    required this.rows,
    required this.unclaimed,
    required this.ladder,
  });

  factory CostRegistryReportDto.fromJson(Map<String, Object?> json) =>
      _$CostRegistryReportDtoFromJson(json);

  final String generatedAt;
  final String? spendRefreshedAt;
  final List<CostRegistryRowDto> rows;
  final List<CostRegistryUnclaimedDto> unclaimed;
  final CostLadderDto ladder;

  Map<String, Object?> toJson() => _$CostRegistryReportDtoToJson(this);
}
