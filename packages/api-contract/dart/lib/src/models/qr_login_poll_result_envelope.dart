// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qr_login_poll_result_dto.dart';
import 'response_meta_dto.dart';

part 'qr_login_poll_result_envelope.g.dart';

@JsonSerializable()
class QrLoginPollResultEnvelope {
  const QrLoginPollResultEnvelope({required this.data, this.meta});

  factory QrLoginPollResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$QrLoginPollResultEnvelopeFromJson(json);

  final QrLoginPollResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QrLoginPollResultEnvelopeToJson(this);
}
