// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_worker_reviewed_dto.g.dart';

@JsonSerializable()
class AiWorkerReviewedDto {
  const AiWorkerReviewedDto({required this.updated});

  factory AiWorkerReviewedDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerReviewedDtoFromJson(json);

  final num updated;

  Map<String, Object?> toJson() => _$AiWorkerReviewedDtoToJson(this);
}
