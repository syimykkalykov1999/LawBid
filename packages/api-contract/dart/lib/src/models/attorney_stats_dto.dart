// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'attorney_stats_dto.g.dart';

@JsonSerializable()
class AttorneyStatsDto {
  const AttorneyStatsDto({
    required this.profileViews30d,
    required this.bidsSent30d,
    required this.bidsAccepted30d,
    required this.clientsTotal,
  });

  factory AttorneyStatsDto.fromJson(Map<String, Object?> json) =>
      _$AttorneyStatsDtoFromJson(json);

  /// Profile opens, last 30 days
  final int profileViews30d;

  /// Offers sent, last 30 days
  final int bidsSent30d;

  /// Offers accepted, last 30 days
  final int bidsAccepted30d;

  /// Clients who hired this attorney through LawBid, all time
  final int clientsTotal;

  Map<String, Object?> toJson() => _$AttorneyStatsDtoToJson(this);
}
