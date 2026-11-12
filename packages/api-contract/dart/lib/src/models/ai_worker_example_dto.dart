// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_example_dto.g.dart';

@JsonSerializable()
class AiWorkerExampleDto {
  const AiWorkerExampleDto({required this.itemId, required this.summary});

  factory AiWorkerExampleDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerExampleDtoFromJson(json);

  final String itemId;
  final String summary;

  Map<String, Object?> toJson() => _$AiWorkerExampleDtoToJson(this);
}
