// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_seats_dto.g.dart';

@JsonSerializable()
class SetSeatsDto {
  const SetSeatsDto({required this.seats, this.prorationDate});

  factory SetSeatsDto.fromJson(Map<String, Object?> json) =>
      _$SetSeatsDtoFromJson(json);

  /// Extra seats on top of the ones the plan includes.
  final int seats;

  /// Owner 2026-10-22: `prorationDate` from POST /subscriptions/seats/preview, so the charge equals the amount shown (unix seconds; now when absent).
  final int? prorationDate;

  Map<String, Object?> toJson() => _$SetSeatsDtoToJson(this);
}
