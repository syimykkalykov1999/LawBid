// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_id_dto.g.dart';

@JsonSerializable()
class AiWorkerIdDto {
  const AiWorkerIdDto({required this.id});

  factory AiWorkerIdDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerIdDtoFromJson(json);

  final String id;

  Map<String, Object?> toJson() => _$AiWorkerIdDtoToJson(this);
}
