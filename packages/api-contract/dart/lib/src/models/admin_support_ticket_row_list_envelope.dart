// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_ticket_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_support_ticket_row_list_envelope.g.dart';

@JsonSerializable()
class AdminSupportTicketRowListEnvelope {
  const AdminSupportTicketRowListEnvelope({required this.data, this.meta});

  factory AdminSupportTicketRowListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminSupportTicketRowListEnvelopeFromJson(json);

  final List<AdminSupportTicketRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminSupportTicketRowListEnvelopeToJson(this);
}
