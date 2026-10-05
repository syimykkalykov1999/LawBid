// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_billing_user_dto.dart';
import 'seat_limit_request_status.dart';

part 'admin_seat_limit_request_dto.g.dart';

@JsonSerializable()
class AdminSeatLimitRequestDto {
  const AdminSeatLimitRequestDto({
    required this.id,
    required this.status,
    required this.requestedSeats,
    required this.grantedSeats,
    required this.note,
    required this.decisionNote,
    required this.createdAt,
    required this.decidedAt,
    required this.attorneyId,
    required this.user,
    required this.currentLimit,
    required this.assistantsUsed,
  });

  factory AdminSeatLimitRequestDto.fromJson(Map<String, Object?> json) =>
      _$AdminSeatLimitRequestDtoFromJson(json);

  final String id;
  final SeatLimitRequestStatus status;
  final int requestedSeats;
  final int? grantedSeats;
  final String? note;
  final String? decisionNote;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final String attorneyId;
  final AdminBillingUserDto? user;

  /// The attorney's limit today (own or global).
  final int currentLimit;
  final int assistantsUsed;

  Map<String, Object?> toJson() => _$AdminSeatLimitRequestDtoToJson(this);
}
