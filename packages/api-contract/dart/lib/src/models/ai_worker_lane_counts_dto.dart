// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_lane_counts_dto.g.dart';

@JsonSerializable()
class AiWorkerLaneCountsDto {
  const AiWorkerLaneCountsDto({
    required this.priority,
    required this.audit,
    required this.bulk,
  });

  factory AiWorkerLaneCountsDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerLaneCountsDtoFromJson(json);

  final num priority;
  final num audit;
  final num bulk;

  Map<String, Object?> toJson() => _$AiWorkerLaneCountsDtoToJson(this);
}
