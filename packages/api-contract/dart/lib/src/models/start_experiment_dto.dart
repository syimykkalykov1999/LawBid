// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_experiment_dto.g.dart';

@JsonSerializable()
class StartExperimentDto {
  const StartExperimentDto({required this.trafficPercent});

  factory StartExperimentDto.fromJson(Map<String, Object?> json) =>
      _$StartExperimentDtoFromJson(json);

  /// Share of users who enter the test (5-10 to begin).
  final int trafficPercent;

  Map<String, Object?> toJson() => _$StartExperimentDtoToJson(this);
}
