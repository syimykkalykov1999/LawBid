// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_video_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideoStatsDto _$AdminVideoStatsDtoFromJson(Map<String, dynamic> json) =>
    AdminVideoStatsDto(
      byStatus: (json['byStatus'] as List<dynamic>)
          .map(
            (e) => AdminVideoStatusCountDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      storageBytes: (json['storageBytes'] as num).toInt(),
      uploads7d: (json['uploads7d'] as num).toInt(),
      failed7d: (json['failed7d'] as num).toInt(),
    );

Map<String, dynamic> _$AdminVideoStatsDtoToJson(AdminVideoStatsDto instance) =>
    <String, dynamic>{
      'byStatus': instance.byStatus.map((e) => e.toJson()).toList(),
      'storageBytes': instance.storageBytes,
      'uploads7d': instance.uploads7d,
      'failed7d': instance.failed7d,
    };
