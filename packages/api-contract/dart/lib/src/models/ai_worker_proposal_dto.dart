// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_example_dto.dart';
import 'ai_worker_queue_key.dart';

part 'ai_worker_proposal_dto.g.dart';

@JsonSerializable()
class AiWorkerProposalDto {
  const AiWorkerProposalDto({
    required this.queue,
    required this.label,
    required this.open,
    required this.roleId,
    required this.text,
    required this.examples,
  });

  factory AiWorkerProposalDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerProposalDtoFromJson(json);

  final AiWorkerQueueKey queue;
  final String label;
  final num open;
  final String? roleId;
  final String text;
  final List<AiWorkerExampleDto> examples;

  Map<String, Object?> toJson() => _$AiWorkerProposalDtoToJson(this);
}
