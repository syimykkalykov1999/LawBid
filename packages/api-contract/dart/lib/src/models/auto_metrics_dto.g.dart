// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auto_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoMetricsDto _$AutoMetricsDtoFromJson(Map<String, dynamic> json) =>
    AutoMetricsDto(
      days: (json['days'] as num).toInt(),
      perDay: (json['perDay'] as List<dynamic>)
          .map((e) => MetricsDayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      autoActions: (json['autoActions'] as num).toInt(),
      shadowActions: (json['shadowActions'] as num).toInt(),
      appeals: (json['appeals'] as num).toInt(),
      decidedAppeals: (json['decidedAppeals'] as num).toInt(),
      overturned: (json['overturned'] as num).toInt(),
      pendingAppeals: (json['pendingAppeals'] as num).toInt(),
      overdueAppeals: (json['overdueAppeals'] as num).toInt(),
      priorityReviews: (json['priorityReviews'] as num).toInt(),
      appealRate: json['appealRate'] as num,
      overturnRate: json['overturnRate'] as num,
      alarm: json['alarm'] as bool,
      alarmPercent: json['alarmPercent'] as num,
      detections: (json['detections'] as List<dynamic>)
          .map((e) => DetectionMetricDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AutoMetricsDtoToJson(AutoMetricsDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'perDay': instance.perDay.map((e) => e.toJson()).toList(),
      'autoActions': instance.autoActions,
      'shadowActions': instance.shadowActions,
      'appeals': instance.appeals,
      'decidedAppeals': instance.decidedAppeals,
      'overturned': instance.overturned,
      'pendingAppeals': instance.pendingAppeals,
      'overdueAppeals': instance.overdueAppeals,
      'priorityReviews': instance.priorityReviews,
      'appealRate': instance.appealRate,
      'overturnRate': instance.overturnRate,
      'alarm': instance.alarm,
      'alarmPercent': instance.alarmPercent,
      'detections': instance.detections.map((e) => e.toJson()).toList(),
    };
