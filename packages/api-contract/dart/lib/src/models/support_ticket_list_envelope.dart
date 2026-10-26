// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_ticket_dto.dart';

part 'support_ticket_list_envelope.g.dart';

@JsonSerializable()
class SupportTicketListEnvelope {
  const SupportTicketListEnvelope({required this.data, this.meta});

  factory SupportTicketListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportTicketListEnvelopeFromJson(json);

  final List<SupportTicketDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportTicketListEnvelopeToJson(this);
}
