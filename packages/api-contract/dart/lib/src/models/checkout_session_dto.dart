// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'checkout_session_dto.g.dart';

@JsonSerializable()
class CheckoutSessionDto {
  const CheckoutSessionDto({
    required this.url,
    required this.sessionId,
    required this.trialEligible,
    required this.priceCents,
    required this.trialDays,
  });

  factory CheckoutSessionDto.fromJson(Map<String, Object?> json) =>
      _$CheckoutSessionDtoFromJson(json);

  /// Open in the browser.
  final String url;
  final String sessionId;
  final bool trialEligible;
  final int priceCents;
  final int trialDays;

  Map<String, Object?> toJson() => _$CheckoutSessionDtoToJson(this);
}
