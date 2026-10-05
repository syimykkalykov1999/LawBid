// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'seat_summary_dto.g.dart';

@JsonSerializable()
class SeatSummaryDto {
  const SeatSummaryDto({
    required this.included,
    required this.extra,
    required this.total,
    required this.max,
  });

  factory SeatSummaryDto.fromJson(Map<String, Object?> json) =>
      _$SeatSummaryDtoFromJson(json);

  final int included;
  final int extra;
  final int total;
  final int max;

  Map<String, Object?> toJson() => _$SeatSummaryDtoToJson(this);
}
