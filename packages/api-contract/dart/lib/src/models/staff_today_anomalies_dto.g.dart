// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_anomalies_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayAnomaliesDto _$StaffTodayAnomaliesDtoFromJson(
  Map<String, dynamic> json,
) => StaffTodayAnomaliesDto(
  day: json['day'] as String?,
  total: (json['total'] as num).toInt(),
  items: (json['items'] as List<dynamic>)
      .map((e) => StaffTodayAnomalyDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StaffTodayAnomaliesDtoToJson(
  StaffTodayAnomaliesDto instance,
) => <String, dynamic>{
  'day': ?instance.day,
  'total': instance.total,
  'items': instance.items.map((e) => e.toJson()).toList(),
};
