// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_review_verdict_outcome.dart';

part 'review_verdict_result_dto.g.dart';

@JsonSerializable()
class ReviewVerdictResultDto {
  const ReviewVerdictResultDto({required this.ok, required this.result});

  factory ReviewVerdictResultDto.fromJson(Map<String, Object?> json) =>
      _$ReviewVerdictResultDtoFromJson(json);

  final bool ok;
  final StaffReviewVerdictOutcome result;

  Map<String, Object?> toJson() => _$ReviewVerdictResultDtoToJson(this);
}
