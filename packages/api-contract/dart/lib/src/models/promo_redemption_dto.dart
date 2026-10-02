// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';

part 'promo_redemption_dto.g.dart';

@JsonSerializable()
class PromoRedemptionDto {
  const PromoRedemptionDto({
    required this.id,
    required this.promoId,
    required this.userId,
    required this.user,
    required this.amountOffCents,
    required this.paymentId,
    required this.createdAt,
  });

  factory PromoRedemptionDto.fromJson(Map<String, Object?> json) =>
      _$PromoRedemptionDtoFromJson(json);

  final String id;
  final String promoId;
  final String userId;
  final AdminBillingUserDto? user;
  final int? amountOffCents;
  final String? paymentId;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$PromoRedemptionDtoToJson(this);
}
