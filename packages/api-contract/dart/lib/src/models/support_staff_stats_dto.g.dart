// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_staff_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportStaffStatsDto _$SupportStaffStatsDtoFromJson(
  Map<String, dynamic> json,
) => SupportStaffStatsDto(
  adminId: json['adminId'] as String,
  name: json['name'] as String,
  replies: json['replies'] as num,
  firstResponses: json['firstResponses'] as num,
  resolved: json['resolved'] as num,
  slaBreaches: json['slaBreaches'] as num,
  openNow: json['openNow'] as num,
  onShift: json['onShift'] as bool,
  medianFirstResponseMinutes: json['medianFirstResponseMinutes'] as num?,
);

Map<String, dynamic> _$SupportStaffStatsDtoToJson(
  SupportStaffStatsDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'name': instance.name,
  'replies': instance.replies,
  'firstResponses': instance.firstResponses,
  'medianFirstResponseMinutes': ?instance.medianFirstResponseMinutes,
  'resolved': instance.resolved,
  'slaBreaches': instance.slaBreaches,
  'openNow': instance.openNow,
  'onShift': instance.onShift,
};
