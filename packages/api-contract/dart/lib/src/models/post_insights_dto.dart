// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_insights_counts_dto.dart';
import 'post_insights_day_dto.dart';

part 'post_insights_dto.g.dart';

@JsonSerializable()
class PostInsightsDto {
  const PostInsightsDto({
    required this.postId,
    required this.publishedAt,
    required this.totals,
    required this.interactions,
    required this.reachFollowers,
    required this.reachNonFollowers,
    required this.days,
  });
  
  factory PostInsightsDto.fromJson(Map<String, Object?> json) => _$PostInsightsDtoFromJson(json);
  
  final String postId;
  final DateTime publishedAt;

  /// All time.
  final PostInsightsCountsDto totals;

  /// likes + comments + saves + reposts + shares, all time.
  final int interactions;

  /// Of [totals.reach]: accounts that follow the author now.
  final int reachFollowers;
  final int reachNonFollowers;

  /// One entry per local day, oldest first: the last 30 days, or since the.
  /// post was published.
  final List<PostInsightsDayDto> days;

  Map<String, Object?> toJson() => _$PostInsightsDtoToJson(this);
}
