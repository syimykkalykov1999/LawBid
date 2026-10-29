// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fixed_cost_dto.dart';

part 'update_fixed_costs_dto.g.dart';

@JsonSerializable()
class UpdateFixedCostsDto {
  const UpdateFixedCostsDto({
    required this.items,
  });
  
  factory UpdateFixedCostsDto.fromJson(Map<String, Object?> json) => _$UpdateFixedCostsDtoFromJson(json);
  
  final List<FixedCostDto> items;

  Map<String, Object?> toJson() => _$UpdateFixedCostsDtoToJson(this);
}
