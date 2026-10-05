// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_plan_dto_audience.dart';
import 'create_plan_dto_interval.dart';
import 'create_plan_dto_status.dart';
import 'localized_text_input_dto.dart';
import 'long_localized_text_input_dto.dart';

part 'create_plan_dto.g.dart';

@JsonSerializable()
class CreatePlanDto {
  const CreatePlanDto({
    required this.code,
    required this.audience,
    required this.interval,
    this.name,
    this.tagline,
    this.description,
    this.entitlements,
    this.highlights,
    this.amountCents,
    this.status,
    this.sort,
    this.isDefault,
    this.note,
  });

  factory CreatePlanDto.fromJson(Map<String, Object?> json) =>
      _$CreatePlanDtoFromJson(json);

  final LocalizedTextInputDto? name;
  final LocalizedTextInputDto? tagline;
  final LongLocalizedTextInputDto? description;

  /// Entitlement values {key: boolean | number | null}; unknown keys are dropped.
  final dynamic entitlements;
  final List<LocalizedTextInputDto>? highlights;

  /// Price per interval in cents; a change creates a new Stripe price (history kept).
  final int? amountCents;
  final CreatePlanDtoStatus? status;
  final int? sort;

  /// The plan legacy flows buy for this audience + interval.
  final bool? isDefault;
  final String? note;
  final String code;
  final CreatePlanDtoAudience audience;
  final CreatePlanDtoInterval interval;

  Map<String, Object?> toJson() => _$CreatePlanDtoToJson(this);
}
