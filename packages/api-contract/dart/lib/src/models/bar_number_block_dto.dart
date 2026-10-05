// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_trust_attorney_dto.dart';
import 'bar_number_block_dto_source.dart';
import 'bar_number_block_event_dto.dart';
import 'staff_admin_dto.dart';

part 'bar_number_block_dto.g.dart';

@JsonSerializable()
class BarNumberBlockDto {
  const BarNumberBlockDto({
    required this.id,
    required this.stateCode,
    required this.barNumber,
    required this.active,
    required this.reason,
    required this.source,
    required this.attorney,
    required this.blockedBy,
    required this.blockedAt,
    required this.blockContacts,
    required this.email,
    required this.phone,
    required this.unblockedAt,
    required this.unblockedBy,
    required this.unblockReason,
    required this.attempts,
    required this.lastAttemptAt,
    required this.lookupUrl,
    required this.events,
  });

  factory BarNumberBlockDto.fromJson(Map<String, Object?> json) =>
      _$BarNumberBlockDtoFromJson(json);

  final String id;
  final String stateCode;
  final String barNumber;
  final bool active;
  final String reason;
  final BarNumberBlockDtoSource source;
  final AdminTrustAttorneyDto? attorney;
  final StaffAdminDto? blockedBy;
  final DateTime blockedAt;
  final bool blockContacts;

  /// Masked.
  final String? email;

  /// Masked.
  final String? phone;
  final DateTime? unblockedAt;
  final StaffAdminDto? unblockedBy;
  final String? unblockReason;

  /// How many times someone tried to register it again.
  final int attempts;
  final DateTime? lastAttemptAt;
  final String? lookupUrl;
  final List<BarNumberBlockEventDto> events;

  Map<String, Object?> toJson() => _$BarNumberBlockDtoToJson(this);
}
