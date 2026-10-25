// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'spend_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SpendReportDto _$SpendReportDtoFromJson(Map<String, dynamic> json) =>
    SpendReportDto(
      generatedAt: json['generatedAt'] as String,
      refreshedAt: json['refreshedAt'] as String?,
      vendors: (json['vendors'] as List<dynamic>)
          .map((e) => VendorSpendDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      fixed: (json['fixed'] as List<dynamic>)
          .map((e) => FixedCostViewDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      prices: (json['prices'] as List<dynamic>)
          .map((e) => PriceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: SpendTotalDto.fromJson(json['total'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SpendReportDtoToJson(SpendReportDto instance) =>
    <String, dynamic>{
      'generatedAt': instance.generatedAt,
      'refreshedAt': ?instance.refreshedAt,
      'vendors': instance.vendors.map((e) => e.toJson()).toList(),
      'fixed': instance.fixed.map((e) => e.toJson()).toList(),
      'prices': instance.prices.map((e) => e.toJson()).toList(),
      'total': instance.total.toJson(),
    };
