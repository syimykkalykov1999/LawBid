// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_queue_key.dart';

part 'ai_worker_queue_dto.g.dart';

@JsonSerializable()
class AiWorkerQueueDto {
  const AiWorkerQueueDto({required this.key, required this.label});

  factory AiWorkerQueueDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerQueueDtoFromJson(json);

  final AiWorkerQueueKey key;
  final String label;

  Map<String, Object?> toJson() => _$AiWorkerQueueDtoToJson(this);
}
