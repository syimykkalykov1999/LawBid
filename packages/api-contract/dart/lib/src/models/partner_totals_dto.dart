// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'partner_totals_dto.g.dart';

@JsonSerializable()
class PartnerTotalsDto {
  const PartnerTotalsDto({
    required this.heldCents,
    required this.approvedCents,
    required this.paidCents,
    required this.thisMonthCents,
    required this.referredCount,
    required this.qualifiedCount,
  });

  factory PartnerTotalsDto.fromJson(Map<String, Object?> json) =>
      _$PartnerTotalsDtoFromJson(json);

  /// Held (in the check), cents.
  final int heldCents;

  /// Approved, awaiting payout.
  final int approvedCents;
  final int paidCents;

  /// Accrued this month (any status but reversed).
  final int thisMonthCents;

  /// People who joined by the link.
  final int referredCount;

  /// Of them, earned a commission.
  final int qualifiedCount;

  Map<String, Object?> toJson() => _$PartnerTotalsDtoToJson(this);
}
