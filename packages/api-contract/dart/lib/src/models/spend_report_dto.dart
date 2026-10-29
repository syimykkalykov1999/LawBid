// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fixed_cost_view_dto.dart';
import 'price_dto.dart';
import 'spend_total_dto.dart';
import 'vendor_spend_dto.dart';

part 'spend_report_dto.g.dart';

@JsonSerializable()
class SpendReportDto {
  const SpendReportDto({
    required this.generatedAt,
    required this.refreshedAt,
    required this.vendors,
    required this.fixed,
    required this.prices,
    required this.total,
  });
  
  factory SpendReportDto.fromJson(Map<String, Object?> json) => _$SpendReportDtoFromJson(json);
  
  final String generatedAt;
  final String? refreshedAt;
  final List<VendorSpendDto> vendors;
  final List<FixedCostViewDto> fixed;
  final List<PriceDto> prices;
  final SpendTotalDto total;

  Map<String, Object?> toJson() => _$SpendReportDtoToJson(this);
}
