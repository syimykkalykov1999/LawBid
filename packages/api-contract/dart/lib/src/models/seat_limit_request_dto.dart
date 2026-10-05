// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'seat_limit_request_status.dart';

part 'seat_limit_request_dto.g.dart';

@JsonSerializable()
class SeatLimitRequestDto {
  const SeatLimitRequestDto({
    required this.id,
    required this.status,
    required this.requestedSeats,
    required this.grantedSeats,
    required this.note,
    required this.decisionNote,
    required this.createdAt,
    required this.decidedAt,
  });

  factory SeatLimitRequestDto.fromJson(Map<String, Object?> json) =>
      _$SeatLimitRequestDtoFromJson(json);

  final String id;
  final SeatLimitRequestStatus status;
  final int requestedSeats;
  final int? grantedSeats;
  final String? note;
  final String? decisionNote;
  final DateTime createdAt;
  final DateTime? decidedAt;

  Map<String, Object?> toJson() => _$SeatLimitRequestDtoToJson(this);
}
