// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'billing_totals_dto.g.dart';

@JsonSerializable()
class BillingTotalsDto {
  const BillingTotalsDto({
    required this.minutes,
    required this.timeCents,
    required this.expensesCents,
    required this.totalCents,
  });

  factory BillingTotalsDto.fromJson(Map<String, Object?> json) =>
      _$BillingTotalsDtoFromJson(json);

  final num minutes;
  final num timeCents;
  final num expensesCents;
  final num totalCents;

  Map<String, Object?> toJson() => _$BillingTotalsDtoToJson(this);
}
