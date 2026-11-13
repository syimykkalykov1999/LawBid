// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_lane_counts_dto.dart';
import 'ai_worker_proposal_dto.dart';
import 'ai_worker_queue_dto.dart';
import 'ai_worker_role_dto.dart';
import 'ai_worker_run_dto.dart';

part 'ai_worker_status_dto.g.dart';

@JsonSerializable()
class AiWorkerStatusDto {
  const AiWorkerStatusDto({
    required this.enabled,
    required this.budgetCents,
    required this.spentCents,
    required this.models,
    required this.defaultModel,
    required this.queues,
    required this.toReview,
    required this.toReviewByLane,
    required this.roles,
    required this.runs,
    required this.proposals,
  });

  factory AiWorkerStatusDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerStatusDtoFromJson(json);

  /// Master switch staff.ai_enabled is on.
  final bool enabled;

  /// staff.ai.monthly_cents
  final num budgetCents;
  final num spentCents;
  final List<String> models;
  final String defaultModel;
  final List<AiWorkerQueueDto> queues;

  /// Proposals waiting for the owner.
  final num toReview;
  final AiWorkerLaneCountsDto toReviewByLane;
  final List<AiWorkerRoleDto> roles;
  final List<AiWorkerRunDto> runs;
  final List<AiWorkerProposalDto> proposals;

  Map<String, Object?> toJson() => _$AiWorkerStatusDtoToJson(this);
}
