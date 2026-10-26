// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_mode_result_dto_state.dart';

part 'cost_mode_result_dto.g.dart';

@JsonSerializable()
class CostModeResultDto {
  const CostModeResultDto({required this.id, required this.state});

  factory CostModeResultDto.fromJson(Map<String, Object?> json) =>
      _$CostModeResultDtoFromJson(json);

  final String id;
  final CostModeResultDtoState state;

  Map<String, Object?> toJson() => _$CostModeResultDtoToJson(this);
}
