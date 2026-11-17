// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_addon_preview_dto.g.dart';

@JsonSerializable()
class HotlineAddonPreviewDto {
  const HotlineAddonPreviewDto({
    required this.amountNowCents,
    required this.currency,
    required this.prorationDate,
    required this.periodEnd,
    required this.priceCents,
    required this.monthlyIncreaseCents,
    required this.nextChargeCents,
    this.taxCents,
  });

  factory HotlineAddonPreviewDto.fromJson(Map<String, Object?> json) =>
      _$HotlineAddonPreviewDtoFromJson(json);

  /// Charged now: the prorated rest of the current period (0 when it is on already or paid to the period end).
  final int amountNowCents;
  final int? taxCents;
  final String currency;

  /// Send back with POST /subscriptions/hotline (unix seconds).
  final int prorationDate;
  final DateTime? periodEnd;

  /// The add-on per month.
  final int priceCents;
  final int monthlyIncreaseCents;

  /// The next monthly invoice with the add-on.
  final int nextChargeCents;

  Map<String, Object?> toJson() => _$HotlineAddonPreviewDtoToJson(this);
}
