// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'increase_capacity_dto_target.dart';

part 'increase_capacity_dto.g.dart';

@JsonSerializable()
class IncreaseCapacityDto {
  const IncreaseCapacityDto({required this.target});

  factory IncreaseCapacityDto.fromJson(Map<String, Object?> json) =>
      _$IncreaseCapacityDtoFromJson(json);

  final IncreaseCapacityDtoTarget target;

  Map<String, Object?> toJson() => _$IncreaseCapacityDtoToJson(this);
}
