// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qa_summary_dto.g.dart';

@JsonSerializable()
class QaSummaryDto {
  const QaSummaryDto({
    required this.newCount,
    required this.bannerEnabled,
    required this.bannerIntervalHours,
    required this.bannerMinNew,
    required this.profileCtaEnabled,
  });

  factory QaSummaryDto.fromJson(Map<String, Object?> json) =>
      _$QaSummaryDtoFromJson(json);

  /// Unanswered questions of the last 24 hours in my practice areas and states (attorney; 0 for others)
  final num newCount;

  /// Show the card among the feed posts
  final bool bannerEnabled;

  /// Hours between two showings of the card
  final num bannerIntervalHours;

  /// Show the card from this many new questions
  final num bannerMinNew;

  /// Show the call line on the own profile
  final bool profileCtaEnabled;

  Map<String, Object?> toJson() => _$QaSummaryDtoToJson(this);
}
