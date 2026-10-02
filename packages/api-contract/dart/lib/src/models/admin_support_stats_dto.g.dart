// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportStatsDto _$AdminSupportStatsDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportStatsDto(
  byStatus: AdminSupportStatusCountsDto.fromJson(
    json['byStatus'] as Map<String, dynamic>,
  ),
  openUnassigned: json['openUnassigned'] as num,
  unreadByAdmin: json['unreadByAdmin'] as num,
  attention: json['attention'] as num,
  avgFirstResponseMinutes30d: json['avgFirstResponseMinutes30d'] as num?,
);

Map<String, dynamic> _$AdminSupportStatsDtoToJson(
  AdminSupportStatsDto instance,
) => <String, dynamic>{
  'byStatus': instance.byStatus.toJson(),
  'openUnassigned': instance.openUnassigned,
  'unreadByAdmin': instance.unreadByAdmin,
  'attention': instance.attention,
  'avgFirstResponseMinutes30d': ?instance.avgFirstResponseMinutes30d,
};
