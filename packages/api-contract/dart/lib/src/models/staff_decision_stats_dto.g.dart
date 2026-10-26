// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decision_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecisionStatsDto _$StaffDecisionStatsDtoFromJson(
  Map<String, dynamic> json,
) => StaffDecisionStatsDto(
  admin: StaffAdminDto.fromJson(json['admin'] as Map<String, dynamic>),
  cleared: (json['cleared'] as num).toInt(),
  uncleared: (json['uncleared'] as num).toInt(),
  rejected: (json['rejected'] as num).toInt(),
  documentsRequested: (json['documentsRequested'] as num).toInt(),
  released: (json['released'] as num).toInt(),
  fastDecisions: (json['fastDecisions'] as num).toInt(),
  medianSecondsBetween: (json['medianSecondsBetween'] as num?)?.toInt(),
  laterComplaints: (json['laterComplaints'] as num).toInt(),
  laterSuspended: (json['laterSuspended'] as num).toInt(),
  firstDecisionAt: DateTime.parse(json['firstDecisionAt'] as String),
  lastDecisionAt: DateTime.parse(json['lastDecisionAt'] as String),
);

Map<String, dynamic> _$StaffDecisionStatsDtoToJson(
  StaffDecisionStatsDto instance,
) => <String, dynamic>{
  'admin': instance.admin.toJson(),
  'cleared': instance.cleared,
  'uncleared': instance.uncleared,
  'rejected': instance.rejected,
  'documentsRequested': instance.documentsRequested,
  'released': instance.released,
  'fastDecisions': instance.fastDecisions,
  'medianSecondsBetween': ?instance.medianSecondsBetween,
  'laterComplaints': instance.laterComplaints,
  'laterSuspended': instance.laterSuspended,
  'firstDecisionAt': instance.firstDecisionAt.toIso8601String(),
  'lastDecisionAt': instance.lastDecisionAt.toIso8601String(),
};
