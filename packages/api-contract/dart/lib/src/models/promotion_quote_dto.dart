// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_quote_dto.g.dart';

@JsonSerializable()
class PromotionQuoteDto {
  const PromotionQuoteDto({
    required this.days,
    required this.priceCentsPerDay,
    required this.grossCents,
    required this.totalCents,
    required this.creditDaysAvailable,
    required this.creditDaysUsed,
    required this.maxDays,
    required this.enabled,
  });

  factory PromotionQuoteDto.fromJson(Map<String, Object?> json) =>
      _$PromotionQuoteDtoFromJson(json);

  final int days;
  final int priceCentsPerDay;

  /// days × price per day.
  final int grossCents;

  /// If credits are used.
  final int totalCents;
  final int creditDaysAvailable;
  final int creditDaysUsed;
  final int maxDays;
  final bool enabled;

  Map<String, Object?> toJson() => _$PromotionQuoteDtoToJson(this);
}
