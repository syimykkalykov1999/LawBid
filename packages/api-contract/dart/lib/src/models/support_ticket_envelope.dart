// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_ticket_dto.dart';

part 'support_ticket_envelope.g.dart';

@JsonSerializable()
class SupportTicketEnvelope {
  const SupportTicketEnvelope({required this.data, this.meta});

  factory SupportTicketEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportTicketEnvelopeFromJson(json);

  final SupportTicketDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportTicketEnvelopeToJson(this);
}
