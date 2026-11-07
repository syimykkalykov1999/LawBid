// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reco_qa_status_dto.g.dart';

@JsonSerializable()
class RecoQaStatusDto {
  const RecoQaStatusDto({
    required this.enabled,
    required this.lastRunAt,
    required this.durationMs,
    required this.attorneys,
    required this.questions,
    required this.cases,
    required this.queued,
  });

  factory RecoQaStatusDto.fromJson(Map<String, Object?> json) =>
      _$RecoQaStatusDtoFromJson(json);

  /// Flag recommendations_qa_ranking.
  final bool enabled;

  /// ISO time of the last run; null before the first.
  final String? lastRunAt;

  /// How long the last run took, ms.
  final num durationMs;

  /// Attorneys with a Q&A score.
  final num attorneys;

  /// Open questions in the per-topic lists.
  final num questions;

  /// Open cases in the per-topic lists.
  final num cases;

  /// A recompute was queued by this call.
  final bool queued;

  Map<String, Object?> toJson() => _$RecoQaStatusDtoToJson(this);
}
