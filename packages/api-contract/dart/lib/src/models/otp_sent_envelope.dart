// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'otp_sent_dto.dart';
import 'response_meta_dto.dart';

part 'otp_sent_envelope.g.dart';

@JsonSerializable()
class OtpSentEnvelope {
  const OtpSentEnvelope({required this.data, this.meta});

  factory OtpSentEnvelope.fromJson(Map<String, Object?> json) =>
      _$OtpSentEnvelopeFromJson(json);

  final OtpSentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OtpSentEnvelopeToJson(this);
}
