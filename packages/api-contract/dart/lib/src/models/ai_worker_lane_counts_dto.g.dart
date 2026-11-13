// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_lane_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerLaneCountsDto _$AiWorkerLaneCountsDtoFromJson(
  Map<String, dynamic> json,
) => AiWorkerLaneCountsDto(
  priority: json['priority'] as num,
  audit: json['audit'] as num,
  bulk: json['bulk'] as num,
);

Map<String, dynamic> _$AiWorkerLaneCountsDtoToJson(
  AiWorkerLaneCountsDto instance,
) => <String, dynamic>{
  'priority': instance.priority,
  'audit': instance.audit,
  'bulk': instance.bulk,
};
