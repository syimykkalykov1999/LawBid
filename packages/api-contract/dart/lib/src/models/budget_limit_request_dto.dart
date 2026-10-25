// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'budget_limit_request_dto.g.dart';

@JsonSerializable()
class BudgetLimitRequestDto {
  const BudgetLimitRequestDto({required this.name, required this.limitUsd});

  factory BudgetLimitRequestDto.fromJson(Map<String, Object?> json) =>
      _$BudgetLimitRequestDtoFromJson(json);

  final String name;

  /// New monthly limit, USD.
  final num limitUsd;

  Map<String, Object?> toJson() => _$BudgetLimitRequestDtoToJson(this);
}
