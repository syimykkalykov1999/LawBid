// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_addon_dto.g.dart';

@JsonSerializable()
class HotlineAddonDto {
  const HotlineAddonDto({
    required this.priceCents,
    required this.currency,
    required this.active,
    required this.renews,
    required this.endsAt,
    required this.pending,
    required this.canBuy,
  });

  factory HotlineAddonDto.fromJson(Map<String, Object?> json) =>
      _$HotlineAddonDtoFromJson(json);

  /// Per month, in cents.
  final int priceCents;
  final String currency;

  /// Usable now (bought, or paid to endsAt).
  final bool active;

  /// On the subscription: billed next period.
  final bool renews;

  /// Removed: usable until then (the period already paid).
  final DateTime? endsAt;

  /// A purchase waits for the bank (3-D Secure).
  final bool pending;

  /// It can be bought now (after the first payment, like seats); false while the plan is in its trial.
  final bool canBuy;

  Map<String, Object?> toJson() => _$HotlineAddonDtoToJson(this);
}
