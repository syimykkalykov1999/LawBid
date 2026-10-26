// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_ticket_detail_dto.dart';
import 'response_meta_dto.dart';

part 'admin_support_ticket_detail_envelope.g.dart';

@JsonSerializable()
class AdminSupportTicketDetailEnvelope {
  const AdminSupportTicketDetailEnvelope({required this.data, this.meta});

  factory AdminSupportTicketDetailEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminSupportTicketDetailEnvelopeFromJson(json);

  final AdminSupportTicketDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminSupportTicketDetailEnvelopeToJson(this);
}
