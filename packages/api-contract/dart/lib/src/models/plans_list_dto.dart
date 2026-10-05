// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'entitlement_def_dto.dart';
import 'plans_list_dto_audience.dart';
import 'public_plan_dto.dart';

part 'plans_list_dto.g.dart';

@JsonSerializable()
class PlansListDto {
  const PlansListDto({
    required this.audience,
    required this.plans,
    required this.baseline,
    required this.catalog,
  });

  factory PlansListDto.fromJson(Map<String, Object?> json) =>
      _$PlansListDtoFromJson(json);

  final PlansListDtoAudience audience;
  final List<PublicPlanDto> plans;
  final PublicPlanDto? baseline;
  final List<EntitlementDefDto> catalog;

  Map<String, Object?> toJson() => _$PlansListDtoToJson(this);
}
