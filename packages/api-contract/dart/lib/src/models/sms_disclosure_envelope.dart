// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sms_disclosure_dto.dart';

part 'sms_disclosure_envelope.g.dart';

@JsonSerializable()
class SmsDisclosureEnvelope {
  const SmsDisclosureEnvelope({required this.data, this.meta});

  factory SmsDisclosureEnvelope.fromJson(Map<String, Object?> json) =>
      _$SmsDisclosureEnvelopeFromJson(json);

  final SmsDisclosureDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SmsDisclosureEnvelopeToJson(this);
}
