// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';

part 'promotion_model_stat_dto.g.dart';

@JsonSerializable()
class PromotionModelStatDto {
  const PromotionModelStatDto({
    required this.billing,
    required this.count,
    required this.soldCents,
    required this.refundedCents,
    required this.delivered,
  });

  factory PromotionModelStatDto.fromJson(Map<String, Object?> json) =>
      _$PromotionModelStatDtoFromJson(json);

  final BoostBilling billing;
  final int count;

  /// Sold for, cents.
  final int soldCents;

  /// Given back, cents.
  final int refundedCents;

  /// Units delivered.
  final int delivered;

  Map<String, Object?> toJson() => _$PromotionModelStatDtoToJson(this);
}
