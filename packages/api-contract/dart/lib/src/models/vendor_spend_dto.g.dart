// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vendor_spend_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VendorSpendDto _$VendorSpendDtoFromJson(Map<String, dynamic> json) =>
    VendorSpendDto(
      id: VendorSpendDtoId.fromJson(json['id'] as String),
      label: json['label'] as String,
      status: VendorSpendDtoStatus.fromJson(json['status'] as String),
      error: json['error'] as String?,
      updatedAt: json['updatedAt'] as String?,
      monthToDateUsd: json['monthToDateUsd'] as num?,
      lastMonthUsd: json['lastMonthUsd'] as num?,
      forecastUsd: json['forecastUsd'] as num?,
      coveredByCreditsUsd: json['coveredByCreditsUsd'] as num?,
      balanceUsd: json['balanceUsd'] as num?,
      daily: (json['daily'] as List<dynamic>)
          .map((e) => DayUsdDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      lines: (json['lines'] as List<dynamic>)
          .map((e) => VendorSpendLineDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      freeTier: json['freeTier'] == null
          ? null
          : FreeTierDto.fromJson(json['freeTier'] as Map<String, dynamic>),
      notes: (json['notes'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$VendorSpendDtoToJson(VendorSpendDto instance) =>
    <String, dynamic>{
      'id': instance.id.toJson(),
      'label': instance.label,
      'status': instance.status.toJson(),
      'error': ?instance.error,
      'updatedAt': ?instance.updatedAt,
      'monthToDateUsd': ?instance.monthToDateUsd,
      'lastMonthUsd': ?instance.lastMonthUsd,
      'forecastUsd': ?instance.forecastUsd,
      'coveredByCreditsUsd': ?instance.coveredByCreditsUsd,
      'balanceUsd': ?instance.balanceUsd,
      'daily': instance.daily.map((e) => e.toJson()).toList(),
      'lines': instance.lines.map((e) => e.toJson()).toList(),
      'freeTier': ?instance.freeTier?.toJson(),
      'notes': instance.notes,
    };
