// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plan_price_history_dto.dart';
import 'admin_plan_price_item_dto.dart';
import 'admin_set_plan_price_result_dto_mode.dart';

part 'admin_set_plan_price_result_dto.g.dart';

@JsonSerializable()
class AdminSetPlanPriceResultDto {
  const AdminSetPlanPriceResultDto({
    required this.currency,
    required this.mode,
    required this.items,
    required this.history,
    required this.stripeError,
  });

  factory AdminSetPlanPriceResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminSetPlanPriceResultDtoFromJson(json);

  final String currency;
  final AdminSetPlanPriceResultDtoMode mode;
  final List<AdminPlanPriceItemDto> items;
  final List<AdminPlanPriceHistoryDto> history;

  /// Set when the Stripe price could not be created now (it is retried at the next checkout).
  final String? stripeError;

  Map<String, Object?> toJson() => _$AdminSetPlanPriceResultDtoToJson(this);
}
