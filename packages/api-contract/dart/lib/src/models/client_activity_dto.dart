// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_activity_dto.g.dart';

@JsonSerializable()
class ClientActivityDto {
  const ClientActivityDto({
    required this.online,
    required this.respondsWithinDay,
    this.lastSeenDays,
  });

  factory ClientActivityDto.fromJson(Map<String, Object?> json) =>
      _$ClientActivityDtoFromJson(json);

  /// In the app right now.
  final bool online;

  /// Whole days since the client was last seen; null when online.
  final int? lastSeenDays;

  /// Median answer to bids / messages within 24 h over the last 30 days (≥ 3 samples).
  final bool respondsWithinDay;

  Map<String, Object?> toJson() => _$ClientActivityDtoToJson(this);
}
