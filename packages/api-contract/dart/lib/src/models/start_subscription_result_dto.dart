// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_subscription_result_dto.g.dart';

@JsonSerializable()
class StartSubscriptionResultDto {
  const StartSubscriptionResultDto({
    required this.clientSecret,
    required this.setupIntentId,
    required this.customerId,
    required this.trialEligible,
    required this.priceCents,
    required this.trialDays,
  });

  factory StartSubscriptionResultDto.fromJson(Map<String, Object?> json) =>
      _$StartSubscriptionResultDtoFromJson(json);

  /// SetupIntent client secret for the PaymentSheet.
  final String clientSecret;
  final String setupIntentId;

  /// Stripe customer id (PaymentSheet customer).
  final String customerId;

  /// A 7-day trial is available for this attorney (card checked at confirm).
  final bool trialEligible;
  final int priceCents;
  final int trialDays;

  Map<String, Object?> toJson() => _$StartSubscriptionResultDtoToJson(this);
}
