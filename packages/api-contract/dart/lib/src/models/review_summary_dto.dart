// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'rating_bucket_dto.dart';

part 'review_summary_dto.g.dart';

@JsonSerializable()
class ReviewSummaryDto {
  const ReviewSummaryDto({
    required this.ratingAvg,
    required this.ratingCount,
    required this.distribution,
  });

  factory ReviewSummaryDto.fromJson(Map<String, Object?> json) =>
      _$ReviewSummaryDtoFromJson(json);

  /// Average of published reviews rounded to one decimal; null when there are none ("New — no reviews").
  final num? ratingAvg;
  final int ratingCount;

  /// Count per star, always 5 entries, 5 → 1.
  final List<RatingBucketDto> distribution;

  Map<String, Object?> toJson() => _$ReviewSummaryDtoToJson(this);
}
