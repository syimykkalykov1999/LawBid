// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'seat_change_result.dart';
import 'subscription_me_dto.dart';

part 'seat_change_result_dto.g.dart';

@JsonSerializable()
class SeatChangeResultDto {
  const SeatChangeResultDto({
    required this.status,
    required this.clientSecret,
    required this.amountCents,
    required this.currency,
    required this.effectiveAt,
    required this.changeId,
    required this.overview,
  });

  factory SeatChangeResultDto.fromJson(Map<String, Object?> json) =>
      _$SeatChangeResultDtoFromJson(json);

  /// applied = paid and usable now; requires_action = confirm the payment (3-D Secure) with clientSecret, then GET /subscriptions/me; failed = the card was declined, nothing changed; scheduled = fewer seats from effectiveAt (the period end), no refund.
  final SeatChangeResult status;

  /// The PaymentIntent's client secret (requires_action only).
  final String? clientSecret;
  final int amountCents;
  final String currency;
  final DateTime? effectiveAt;
  final String? changeId;
  final SubscriptionMeDto overview;

  Map<String, Object?> toJson() => _$SeatChangeResultDtoToJson(this);
}
