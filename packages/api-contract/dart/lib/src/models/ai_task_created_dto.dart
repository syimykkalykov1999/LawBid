// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_task_created_dto.g.dart';

@JsonSerializable()
class AiTaskCreatedDto {
  const AiTaskCreatedDto({required this.number, required this.url});

  factory AiTaskCreatedDto.fromJson(Map<String, Object?> json) =>
      _$AiTaskCreatedDtoFromJson(json);

  final num number;
  final String url;

  Map<String, Object?> toJson() => _$AiTaskCreatedDtoToJson(this);
}
