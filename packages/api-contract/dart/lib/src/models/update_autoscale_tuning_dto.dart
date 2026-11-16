// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_autoscale_tuning_dto.g.dart';

@JsonSerializable()
class UpdateAutoscaleTuningDto {
  const UpdateAutoscaleTuningDto({required this.values});

  factory UpdateAutoscaleTuningDto.fromJson(Map<String, Object?> json) =>
      _$UpdateAutoscaleTuningDtoFromJson(json);

  final Map<String, num?> values;

  Map<String, Object?> toJson() => _$UpdateAutoscaleTuningDtoToJson(this);
}
