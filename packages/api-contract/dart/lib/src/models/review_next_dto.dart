// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_sample_dto.dart';
import 'staff_review_next_status.dart';

part 'review_next_dto.g.dart';

@JsonSerializable()
class ReviewNextDto {
  const ReviewNextDto({required this.status, required this.sample});

  factory ReviewNextDto.fromJson(Map<String, Object?> json) =>
      _$ReviewNextDtoFromJson(json);

  final StaffReviewNextStatus status;
  final ReviewSampleDto? sample;

  Map<String, Object?> toJson() => _$ReviewNextDtoToJson(this);
}
