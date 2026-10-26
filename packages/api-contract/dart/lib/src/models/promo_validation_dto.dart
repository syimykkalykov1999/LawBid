// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_discount_type.dart';
import 'promo_reject_reason.dart';

part 'promo_validation_dto.g.dart';

@JsonSerializable()
class PromoValidationDto {
  const PromoValidationDto({
    required this.valid,
    required this.code,
    required this.discountType,
    required this.percentOff,
    required this.amountOffCents,
    required this.freeDays,
    required this.description,
    required this.reason,
  });

  factory PromoValidationDto.fromJson(Map<String, Object?> json) =>
      _$PromoValidationDtoFromJson(json);

  final bool valid;

  /// Normalized (upper-case).
  final String code;
  final PromoDiscountType? discountType;
  final int? percentOff;
  final int? amountOffCents;
  final int? freeDays;
  final String? description;

  /// Why the code cannot be used (valid = false).
  final PromoRejectReason? reason;

  Map<String, Object?> toJson() => _$PromoValidationDtoToJson(this);
}
