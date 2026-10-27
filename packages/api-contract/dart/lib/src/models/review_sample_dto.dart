// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_fact_dto.dart';
import 'review_person_ref_dto.dart';

part 'review_sample_dto.g.dart';

@JsonSerializable()
class ReviewSampleDto {
  const ReviewSampleDto({
    required this.id,
    required this.decisionKind,
    required this.itemId,
    required this.stage,
    required this.outcome,
    required this.decidedAt,
    required this.handleSec,
    required this.facts,
    required this.leasedUntil,
    required this.worker,
  });

  factory ReviewSampleDto.fromJson(Map<String, Object?> json) =>
      _$ReviewSampleDtoFromJson(json);

  final String id;

  /// The kind of the checked decision (verification, report, support_ticket…).
  final String decisionKind;

  /// The checked item.
  final String itemId;

  /// sample · newcomer · ai · peer
  final String? stage;

  /// What the worker chose (read-only).
  final String? outcome;

  /// When the worker closed it.
  final DateTime? decidedAt;

  /// Seconds the worker held it.
  final num? handleSec;

  /// Read-only facts of the item, personal data masked by the admin rules.
  final List<ReviewFactDto> facts;
  final DateTime leasedUntil;

  /// Owner only. Reviewers never see who decided.
  final ReviewPersonRefDto? worker;

  Map<String, Object?> toJson() => _$ReviewSampleDtoToJson(this);
}
