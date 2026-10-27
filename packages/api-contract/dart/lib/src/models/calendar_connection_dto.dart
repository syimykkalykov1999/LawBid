// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calendar_connection_dto_provider.dart';
import 'calendar_connection_dto_status.dart';

part 'calendar_connection_dto.g.dart';

@JsonSerializable()
class CalendarConnectionDto {
  const CalendarConnectionDto({
    required this.provider,
    required this.status,
    required this.readBusy,
    required this.writeEvents,
    this.accountEmail,
    this.lastSyncAt,
    this.lastError,
  });

  factory CalendarConnectionDto.fromJson(Map<String, Object?> json) =>
      _$CalendarConnectionDtoFromJson(json);

  final CalendarConnectionDtoProvider provider;
  final String? accountEmail;
  final CalendarConnectionDtoStatus status;

  /// Their busy time blocks booking.
  final bool readBusy;

  /// Consultations are written into their calendar.
  final bool writeEvents;
  final String? lastSyncAt;
  final String? lastError;

  Map<String, Object?> toJson() => _$CalendarConnectionDtoToJson(this);
}
