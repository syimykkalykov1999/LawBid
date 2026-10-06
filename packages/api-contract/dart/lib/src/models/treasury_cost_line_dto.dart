// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'treasury_cost_line_dto_key.dart';
import 'treasury_cost_line_dto_via.dart';

part 'treasury_cost_line_dto.g.dart';

@JsonSerializable()
class TreasuryCostLineDto {
  const TreasuryCostLineDto({
    required this.key,
    required this.monthlyCents,
    required this.via,
  });

  factory TreasuryCostLineDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryCostLineDtoFromJson(json);

  final TreasuryCostLineDtoKey key;
  final int monthlyCents;

  /// Stays on Stripe, or goes to the «Расходы» bank.
  final TreasuryCostLineDtoVia via;

  Map<String, Object?> toJson() => _$TreasuryCostLineDtoToJson(this);
}
