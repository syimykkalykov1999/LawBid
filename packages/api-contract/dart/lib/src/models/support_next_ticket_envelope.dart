// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_next_ticket_dto.dart';

part 'support_next_ticket_envelope.g.dart';

@JsonSerializable()
class SupportNextTicketEnvelope {
  const SupportNextTicketEnvelope({required this.data, this.meta});

  factory SupportNextTicketEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportNextTicketEnvelopeFromJson(json);

  final SupportNextTicketDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportNextTicketEnvelopeToJson(this);
}
