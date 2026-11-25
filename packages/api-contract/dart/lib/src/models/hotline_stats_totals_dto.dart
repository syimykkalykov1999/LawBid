// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_stats_totals_dto.g.dart';

@JsonSerializable()
class HotlineStatsTotalsDto {
  const HotlineStatsTotalsDto({
    required this.calls,
    required this.talkSeconds,
    required this.casesOffered,
    required this.reviews,
    required this.starsSum,
    required this.clients,
    required this.attorneys,
  });

  factory HotlineStatsTotalsDto.fromJson(Map<String, Object?> json) =>
      _$HotlineStatsTotalsDtoFromJson(json);

  final num calls;
  final num talkSeconds;
  final num casesOffered;
  final num reviews;
  final num starsSum;

  /// client-days (people per day added up)
  final num clients;

  /// attorney-days (people per day added up)
  final num attorneys;

  Map<String, Object?> toJson() => _$HotlineStatsTotalsDtoToJson(this);
}
