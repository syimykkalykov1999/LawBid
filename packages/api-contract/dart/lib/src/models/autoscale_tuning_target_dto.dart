// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autoscale_knob_dto.dart';
import 'autoscale_tuning_target_dto_target.dart';

part 'autoscale_tuning_target_dto.g.dart';

@JsonSerializable()
class AutoscaleTuningTargetDto {
  const AutoscaleTuningTargetDto({
    required this.target,
    required this.available,
    required this.knobs,
  });

  factory AutoscaleTuningTargetDto.fromJson(Map<String, Object?> json) =>
      _$AutoscaleTuningTargetDtoFromJson(json);

  final AutoscaleTuningTargetDtoTarget target;
  final bool available;
  final List<AutoscaleKnobDto> knobs;

  Map<String, Object?> toJson() => _$AutoscaleTuningTargetDtoToJson(this);
}
