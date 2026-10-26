// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'budget_delete_request_dto.g.dart';

@JsonSerializable()
class BudgetDeleteRequestDto {
  const BudgetDeleteRequestDto({required this.name});

  factory BudgetDeleteRequestDto.fromJson(Map<String, Object?> json) =>
      _$BudgetDeleteRequestDtoFromJson(json);

  final String name;

  Map<String, Object?> toJson() => _$BudgetDeleteRequestDtoToJson(this);
}
