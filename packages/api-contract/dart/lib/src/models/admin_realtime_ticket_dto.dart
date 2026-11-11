// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_realtime_ticket_dto.g.dart';

@JsonSerializable()
class AdminRealtimeTicketDto {
  const AdminRealtimeTicketDto({
    required this.enabled,
    required this.ticket,
    required this.namespace,
    required this.ttlSec,
  });

  factory AdminRealtimeTicketDto.fromJson(Map<String, Object?> json) =>
      _$AdminRealtimeTicketDtoFromJson(json);

  /// false: the switch `realtime.admin_events_enabled` is off — keep polling.
  final bool enabled;

  /// One-shot handshake ticket (`auth.ticket`), valid `ttlSec` seconds; null when disabled.
  final dynamic ticket;

  /// The Socket.IO namespace to connect to.
  final String namespace;

  /// Seconds the ticket stays redeemable.
  final num ttlSec;

  Map<String, Object?> toJson() => _$AdminRealtimeTicketDtoToJson(this);
}
