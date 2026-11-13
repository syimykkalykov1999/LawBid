// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_run_started_dto.g.dart';

@JsonSerializable()
class AiWorkerRunStartedDto {
  const AiWorkerRunStartedDto({required this.id, required this.total});

  factory AiWorkerRunStartedDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerRunStartedDtoFromJson(json);

  final String id;
  final num total;

  Map<String, Object?> toJson() => _$AiWorkerRunStartedDtoToJson(this);
}
