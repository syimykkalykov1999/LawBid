// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_system_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSystemCountsDto _$StaffSystemCountsDtoFromJson(
  Map<String, dynamic> json,
) => StaffSystemCountsDto(
  critical: (json['critical'] as num).toInt(),
  high: (json['high'] as num).toInt(),
  medium: (json['medium'] as num).toInt(),
  low: (json['low'] as num).toInt(),
);

Map<String, dynamic> _$StaffSystemCountsDtoToJson(
  StaffSystemCountsDto instance,
) => <String, dynamic>{
  'critical': instance.critical,
  'high': instance.high,
  'medium': instance.medium,
  'low': instance.low,
};
