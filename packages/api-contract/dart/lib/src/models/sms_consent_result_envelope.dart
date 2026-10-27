// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sms_consent_result_dto.dart';

part 'sms_consent_result_envelope.g.dart';

@JsonSerializable()
class SmsConsentResultEnvelope {
  const SmsConsentResultEnvelope({required this.data, this.meta});

  factory SmsConsentResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$SmsConsentResultEnvelopeFromJson(json);

  final SmsConsentResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SmsConsentResultEnvelopeToJson(this);
}
