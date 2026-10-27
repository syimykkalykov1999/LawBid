// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_review_reason.dart';
import 'staff_review_verdict.dart';

part 'review_verdict_body_dto.g.dart';

@JsonSerializable()
class ReviewVerdictBodyDto {
  const ReviewVerdictBodyDto({required this.verdict, this.reasons, this.note});

  factory ReviewVerdictBodyDto.fromJson(Map<String, Object?> json) =>
      _$ReviewVerdictBodyDtoFromJson(json);

  /// confirmed — the decision stands · overturned — it was wrong · unclear — cannot tell (goes to another reviewer, no mark for the worker).
  final StaffReviewVerdict verdict;

  /// Why it was overturned (at least one for «overturned»).
  final List<StaffReviewReason>? reasons;
  final String? note;

  Map<String, Object?> toJson() => _$ReviewVerdictBodyDtoToJson(this);
}
