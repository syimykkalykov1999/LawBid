// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_cost_mode_dto_state.dart';

part 'set_cost_mode_dto.g.dart';

@JsonSerializable()
class SetCostModeDto {
  const SetCostModeDto({required this.state});

  factory SetCostModeDto.fromJson(Map<String, Object?> json) =>
      _$SetCostModeDtoFromJson(json);

  final SetCostModeDtoState state;

  Map<String, Object?> toJson() => _$SetCostModeDtoToJson(this);
}
