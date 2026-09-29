// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_dto.dart';
import 'subscription_dto.dart';

part 'admin_subscription_dto.g.dart';

@JsonSerializable()
class AdminSubscriptionDto {
  const AdminSubscriptionDto({
    required this.userId,
    required this.subscription,
    required this.stripeSubscriptionId,
    required this.stripeCustomerId,
    required this.dashboardUrl,
    required this.payments,
    required this.trialsUsedWithCard,
  });

  factory AdminSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$AdminSubscriptionDtoFromJson(json);

  final String userId;
  final SubscriptionDto? subscription;
  final String? stripeSubscriptionId;
  final String? stripeCustomerId;

  /// Stripe Dashboard link.
  final String? dashboardUrl;

  /// Last 50.
  final List<PaymentDto> payments;
  final int trialsUsedWithCard;

  Map<String, Object?> toJson() => _$AdminSubscriptionDtoToJson(this);
}
