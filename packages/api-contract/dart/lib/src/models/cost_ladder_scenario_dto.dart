// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cost_ladder_scenario_dto.g.dart';

@JsonSerializable()
class CostLadderScenarioDto {
  const CostLadderScenarioDto({required this.users, required this.usd});

  factory CostLadderScenarioDto.fromJson(Map<String, Object?> json) =>
      _$CostLadderScenarioDtoFromJson(json);

  final num users;
  final List<num> usd;

  Map<String, Object?> toJson() => _$CostLadderScenarioDtoToJson(this);
}
