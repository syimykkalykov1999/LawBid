// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewStatsDto _$ReviewStatsDtoFromJson(Map<String, dynamic> json) =>
    ReviewStatsDto(
      snapshotDate: json['snapshotDate'] as String?,
      workspaces: (json['workspaces'] as List<dynamic>)
          .map(
            (e) => ReviewWorkspaceStatsDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      calibration: (json['calibration'] as List<dynamic>)
          .map((e) => ReviewCalibrationDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ReviewStatsDtoToJson(ReviewStatsDto instance) =>
    <String, dynamic>{
      'snapshotDate': ?instance.snapshotDate,
      'workspaces': instance.workspaces.map((e) => e.toJson()).toList(),
      'calibration': instance.calibration.map((e) => e.toJson()).toList(),
    };
