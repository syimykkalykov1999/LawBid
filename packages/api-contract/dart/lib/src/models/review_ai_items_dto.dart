// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_decision.dart';
import 'ai_worker_verdict.dart';

part 'review_ai_items_dto.g.dart';

@JsonSerializable()
class ReviewAiItemsDto {
  const ReviewAiItemsDto({
    required this.ids,
    required this.verdict,
    this.ownerDecision,
    this.ownerNote,
  });

  factory ReviewAiItemsDto.fromJson(Map<String, Object?> json) =>
      _$ReviewAiItemsDtoFromJson(json);

  final List<String> ids;
  final AiWorkerVerdict verdict;

  /// On reject: what is right (taught back to the role).
  final AiWorkerDecision? ownerDecision;
  final String? ownerNote;

  Map<String, Object?> toJson() => _$ReviewAiItemsDtoToJson(this);
}
