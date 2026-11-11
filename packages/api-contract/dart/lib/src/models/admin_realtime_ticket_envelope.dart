// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_realtime_ticket_dto.dart';
import 'response_meta_dto.dart';

part 'admin_realtime_ticket_envelope.g.dart';

@JsonSerializable()
class AdminRealtimeTicketEnvelope {
  const AdminRealtimeTicketEnvelope({required this.data, this.meta});

  factory AdminRealtimeTicketEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminRealtimeTicketEnvelopeFromJson(json);

  final AdminRealtimeTicketDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminRealtimeTicketEnvelopeToJson(this);
}
