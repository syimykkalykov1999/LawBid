// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_insights_day_dto.g.dart';

@JsonSerializable()
class PostInsightsDayDto {
  const PostInsightsDayDto({
    required this.impressions,
    required this.reach,
    required this.views,
    required this.likes,
    required this.comments,
    required this.saves,
    required this.reposts,
    required this.shares,
    required this.profileVisits,
    required this.date,
  });

  factory PostInsightsDayDto.fromJson(Map<String, Object?> json) =>
      _$PostInsightsDayDtoFromJson(json);

  /// Times the card was shown
  final int impressions;

  /// Unique accounts reached
  final int reach;

  /// Video views
  final int views;
  final int likes;
  final int comments;
  final int saves;
  final int reposts;
  final int shares;
  final int profileVisits;
  final DateTime date;

  Map<String, Object?> toJson() => _$PostInsightsDayDtoToJson(this);
}
