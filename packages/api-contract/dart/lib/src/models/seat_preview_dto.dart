// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'seat_preview_dto.g.dart';

@JsonSerializable()
class SeatPreviewDto {
  const SeatPreviewDto({
    required this.seats,
    required this.currentSeats,
    required this.amountNowCents,
    required this.currency,
    required this.prorationDate,
    required this.periodEnd,
    required this.seatCents,
    required this.monthlyIncreaseCents,
    required this.nextChargeCents,
    this.taxCents,
  });

  factory SeatPreviewDto.fromJson(Map<String, Object?> json) =>
      _$SeatPreviewDtoFromJson(json);

  /// The wanted extra seats.
  final int seats;

  /// Extra seats usable now (paid through the period end).
  final int currentSeats;

  /// Charged now: the prorated rest of the current period.
  final int amountNowCents;

  /// Owner 2026-10-22 (Stripe Tax): the tax inside amountNowCents; null = no tax.
  final int? taxCents;
  final String currency;

  /// Send back with POST /subscriptions/seats (unix seconds).
  final int prorationDate;

  /// The paid period ends (the «до {date}» of the sheet).
  final DateTime? periodEnd;

  /// One seat per month.
  final int seatCents;

  /// How much the monthly invoice grows («затем +$Y/мес»).
  final int monthlyIncreaseCents;

  /// The next monthly invoice with the new seats.
  final int nextChargeCents;

  Map<String, Object?> toJson() => _$SeatPreviewDtoToJson(this);
}
