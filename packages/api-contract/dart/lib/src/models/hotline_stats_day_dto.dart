// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_stats_day_dto.g.dart';

@JsonSerializable()
class HotlineStatsDayDto {
  const HotlineStatsDayDto({
    required this.day,
    required this.calls,
    required this.talkSeconds,
    required this.casesOffered,
    required this.reviews,
    required this.starsSum,
    required this.clients,
    required this.attorneys,
  });

  factory HotlineStatsDayDto.fromJson(Map<String, Object?> json) =>
      _$HotlineStatsDayDtoFromJson(json);

  /// YYYY-MM-DD (UTC)
  final String day;
  final num calls;
  final num talkSeconds;

  /// calls turned into a case («Предложить дело»)
  final num casesOffered;
  final num reviews;

  /// sum of the stars (average = starsSum / reviews)
  final num starsSum;
  final num clients;
  final num attorneys;

  Map<String, Object?> toJson() => _$HotlineStatsDayDtoToJson(this);
}
