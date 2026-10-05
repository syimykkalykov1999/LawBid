// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'localized_text_input_dto.dart';
import 'long_localized_text_input_dto.dart';
import 'plan_fields_dto_status.dart';

part 'plan_fields_dto.g.dart';

@JsonSerializable()
class PlanFieldsDto {
  const PlanFieldsDto({
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
    this.applyNow,
  });

  factory PlanFieldsDto.fromJson(Map<String, Object?> json) =>
      _$PlanFieldsDtoFromJson(json);

  final LocalizedTextInputDto? name;
  final LocalizedTextInputDto? tagline;
  final LongLocalizedTextInputDto? description;

  /// Entitlement values {key: boolean | number | null}; unknown keys are dropped.
  final dynamic entitlements;
  final List<LocalizedTextInputDto>? highlights;

  /// Price per interval in cents; a change creates a new Stripe price (history kept).
  final int? amountCents;
  final PlanFieldsDtoStatus? status;
  final int? sort;

  /// The plan legacy flows buy for this audience + interval.
  final bool? isDefault;
  final String? note;

  /// Default true. Push changed entitlements/highlights to current subscribers at once (default). false keeps their frozen terms until "apply to subscribers". Prices never move here.
  final bool? applyNow;

  Map<String, Object?> toJson() => _$PlanFieldsDtoToJson(this);
}
