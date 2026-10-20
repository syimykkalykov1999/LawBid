// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stars_kind_total_dto.dart';
import 'stars_top_gift_dto.dart';

part 'stars_report_dto.g.dart';

@JsonSerializable()
class StarsReportDto {
  const StarsReportDto({
    required this.days,
    required this.starsSold,
    required this.revenueCents,
    required this.purchases,
    required this.starsSpent,
    required this.outstandingStars,
    required this.debtStars,
    required this.debtUsers,
    required this.giftsSent,
    required this.starsConverted,
    required this.byKind,
    required this.topGifts,
  });

  factory StarsReportDto.fromJson(Map<String, Object?> json) =>
      _$StarsReportDtoFromJson(json);

  final int days;

  /// Stars bought in the period.
  final int starsSold;

  /// US cents paid for them.
  final int revenueCents;
  final int purchases;

  /// Stars spent in the period (gifts, sticker packs).
  final int starsSpent;

  /// Stars users hold now — what we still owe in goods.
  final int outstandingStars;

  /// Stars owed after refunded top-ups that were already spent.
  final int debtStars;
  final int debtUsers;
  final int giftsSent;

  /// Stars handed back to receivers (the rest is our fee).
  final int starsConverted;
  final List<StarsKindTotalDto> byKind;
  final List<StarsTopGiftDto> topGifts;

  Map<String, Object?> toJson() => _$StarsReportDtoToJson(this);
}
