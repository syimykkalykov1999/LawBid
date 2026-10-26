// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_send_email_result_dto.dart';
import 'response_meta_dto.dart';

part 'outreach_send_email_result_envelope.g.dart';

@JsonSerializable()
class OutreachSendEmailResultEnvelope {
  const OutreachSendEmailResultEnvelope({required this.data, this.meta});

  factory OutreachSendEmailResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$OutreachSendEmailResultEnvelopeFromJson(json);

  final OutreachSendEmailResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$OutreachSendEmailResultEnvelopeToJson(this);
}
