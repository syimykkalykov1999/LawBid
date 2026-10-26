// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_ladder_day_one_dto.dart';
import 'cost_ladder_scenario_dto.dart';

part 'cost_ladder_dto.g.dart';

@JsonSerializable()
class CostLadderDto {
  const CostLadderDto({
    required this.dayOne,
    required this.scenarios,
    required this.monthToDateUsd,
    required this.projectedUsd,
  });

  factory CostLadderDto.fromJson(Map<String, Object?> json) =>
      _$CostLadderDtoFromJson(json);

  final CostLadderDayOneDto dayOne;
  final List<CostLadderScenarioDto> scenarios;
  final num? monthToDateUsd;
  final num? projectedUsd;

  Map<String, Object?> toJson() => _$CostLadderDtoToJson(this);
}
