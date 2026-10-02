// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_ticket_detail_dto.dart';

part 'support_ticket_detail_envelope.g.dart';

@JsonSerializable()
class SupportTicketDetailEnvelope {
  const SupportTicketDetailEnvelope({required this.data, this.meta});

  factory SupportTicketDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportTicketDetailEnvelopeFromJson(json);

  final SupportTicketDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportTicketDetailEnvelopeToJson(this);
}
