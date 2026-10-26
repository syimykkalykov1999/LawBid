// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plan_price_history_dto.dart';
import 'admin_plan_price_item_dto.dart';
import 'admin_plan_prices_dto_mode.dart';

part 'admin_plan_prices_dto.g.dart';

@JsonSerializable()
class AdminPlanPricesDto {
  const AdminPlanPricesDto({
    required this.currency,
    required this.mode,
    required this.items,
    required this.history,
  });

  factory AdminPlanPricesDto.fromJson(Map<String, Object?> json) =>
      _$AdminPlanPricesDtoFromJson(json);

  final String currency;
  final AdminPlanPricesDtoMode mode;
  final List<AdminPlanPriceItemDto> items;
  final List<AdminPlanPriceHistoryDto> history;

  Map<String, Object?> toJson() => _$AdminPlanPricesDtoToJson(this);
}
