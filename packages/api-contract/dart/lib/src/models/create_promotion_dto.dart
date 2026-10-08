// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';
import 'promotion_audience_dto.dart';

part 'create_promotion_dto.g.dart';

@JsonSerializable()
class CreatePromotionDto {
  const CreatePromotionDto({
    required this.days,
    this.useCredits = true,
    this.dailyBudgetCents,
    this.audience,
    this.promoCode,
    this.billing,
  });

  factory CreatePromotionDto.fromJson(Map<String, Object?> json) =>
      _$CreatePromotionDtoFromJson(json);

  final int days;

  /// Owner 2026-10-05: daily budget; default from the admin.
  final int? dailyBudgetCents;
  final PromotionAudienceDto? audience;

  /// Spend free days earned through referrals first.
  final bool useCredits;
  final String? promoCode;

  /// Owner 2026-10-07: what to pay for; default = the first one on.
  final BoostBilling? billing;

  Map<String, Object?> toJson() => _$CreatePromotionDtoToJson(this);
}
