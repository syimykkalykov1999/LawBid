// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'aws_budget_dto.g.dart';

@JsonSerializable()
class AwsBudgetDto {
  const AwsBudgetDto({
    required this.name,
    required this.limitUsd,
    required this.actualUsd,
    required this.forecastUsd,
    required this.timeUnit,
    required this.prod,
    required this.obsolete,
  });

  factory AwsBudgetDto.fromJson(Map<String, Object?> json) =>
      _$AwsBudgetDtoFromJson(json);

  final String name;
  final num? limitUsd;
  final num? actualUsd;
  final num? forecastUsd;
  final String? timeUnit;
  final bool prod;
  final bool obsolete;

  Map<String, Object?> toJson() => _$AwsBudgetDtoToJson(this);
}
