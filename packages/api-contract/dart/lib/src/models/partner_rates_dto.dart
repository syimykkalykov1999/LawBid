// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_client_rule.dart';

part 'partner_rates_dto.g.dart';

@JsonSerializable()
class PartnerRatesDto {
  const PartnerRatesDto({
    required this.attorneyRateCents,
    required this.clientRateCents,
    required this.monthlyBaseCents,
    required this.clientRule,
    required this.holdDays,
  });

  factory PartnerRatesDto.fromJson(Map<String, Object?> json) =>
      _$PartnerRatesDtoFromJson(json);

  /// Per paying attorney, cents.
  final int attorneyRateCents;

  /// Per qualified client, cents.
  final int clientRateCents;

  /// Fixed monthly base, cents.
  final int monthlyBaseCents;
  final PartnerClientRule clientRule;

  /// Anti-fraud hold, days.
  final int holdDays;

  Map<String, Object?> toJson() => _$PartnerRatesDtoToJson(this);
}
