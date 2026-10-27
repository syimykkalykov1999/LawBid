// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_anomaly_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodayAnomalyDto _$StaffTodayAnomalyDtoFromJson(
  Map<String, dynamic> json,
) => StaffTodayAnomalyDto(
  adminId: json['adminId'] as String,
  name: json['name'] as String,
  rule: json['rule'] as String,
  ruleLabel: json['ruleLabel'] as String,
  score: (json['score'] as num).toInt(),
);

Map<String, dynamic> _$StaffTodayAnomalyDtoToJson(
  StaffTodayAnomalyDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'name': instance.name,
  'rule': instance.rule,
  'ruleLabel': instance.ruleLabel,
  'score': instance.score,
};
