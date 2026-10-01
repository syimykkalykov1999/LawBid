// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_review_appeals_decision_dto_decision.dart';

part 'admin_review_appeals_decision_dto.g.dart';

@JsonSerializable()
class AdminReviewAppealsDecisionDto {
  const AdminReviewAppealsDecisionDto({
    required this.ids,
    required this.decision,
    this.note,
  });

  factory AdminReviewAppealsDecisionDto.fromJson(Map<String, Object?> json) =>
      _$AdminReviewAppealsDecisionDtoFromJson(json);

  final List<String> ids;
  final AdminReviewAppealsDecisionDtoDecision decision;
  final String? note;

  Map<String, Object?> toJson() => _$AdminReviewAppealsDecisionDtoToJson(this);
}
