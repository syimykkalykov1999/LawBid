// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plan_dto.dart';
import 'admin_plans_dto_mode.dart';
import 'entitlement_def_dto.dart';
import 'localized_text_dto.dart';

part 'admin_plans_dto.g.dart';

@JsonSerializable()
class AdminPlansDto {
  const AdminPlansDto({
    required this.currency,
    required this.mode,
    required this.plans,
    required this.catalog,
    required this.privateLocalized,
  });

  factory AdminPlansDto.fromJson(Map<String, Object?> json) =>
      _$AdminPlansDtoFromJson(json);

  final String currency;
  final AdminPlansDtoMode mode;
  final List<AdminPlanDto> plans;
  final List<EntitlementDefDto> catalog;

  /// unused placeholder for schema reuse
  @JsonKey(name: '_localized')
  final List<LocalizedTextDto> privateLocalized;

  Map<String, Object?> toJson() => _$AdminPlansDtoToJson(this);
}
