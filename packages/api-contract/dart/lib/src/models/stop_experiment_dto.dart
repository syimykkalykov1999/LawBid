// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stop_experiment_dto.g.dart';

@JsonSerializable()
class StopExperimentDto {
  const StopExperimentDto({this.reason});

  factory StopExperimentDto.fromJson(Map<String, Object?> json) =>
      _$StopExperimentDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$StopExperimentDtoToJson(this);
}
