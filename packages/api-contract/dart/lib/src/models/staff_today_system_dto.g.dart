// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_system_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodaySystemDto _$StaffTodaySystemDtoFromJson(Map<String, dynamic> json) =>
    StaffTodaySystemDto(
      computedAt: DateTime.parse(json['computedAt'] as String),
      freshSec: (json['freshSec'] as num).toInt(),
      items: (json['items'] as List<dynamic>)
          .map((e) => StaffSystemItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      counts: StaffSystemCountsDto.fromJson(
        json['counts'] as Map<String, dynamic>,
      ),
      sentry: StaffSentrySummaryDto.fromJson(
        json['sentry'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$StaffTodaySystemDtoToJson(
  StaffTodaySystemDto instance,
) => <String, dynamic>{
  'computedAt': instance.computedAt.toIso8601String(),
  'freshSec': instance.freshSec,
  'items': instance.items.map((e) => e.toJson()).toList(),
  'counts': instance.counts.toJson(),
  'sentry': instance.sentry.toJson(),
};
