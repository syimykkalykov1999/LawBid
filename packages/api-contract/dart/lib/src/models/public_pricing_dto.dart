// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'public_pricing_dto.g.dart';

@JsonSerializable()
class PublicPricingDto {
  const PublicPricingDto({
    required this.currency,
    required this.monthlyCents,
    required this.seatCents,
    required this.yearlyCents,
    required this.maxSeats,
    required this.trialDays,
    required this.clientBadgeCents,
  });

  factory PublicPricingDto.fromJson(Map<String, Object?> json) =>
      _$PublicPricingDtoFromJson(json);

  final String currency;
  final int monthlyCents;
  final int seatCents;
  final int yearlyCents;
  final int maxSeats;
  final int trialDays;
  final int clientBadgeCents;

  Map<String, Object?> toJson() => _$PublicPricingDtoToJson(this);
}
