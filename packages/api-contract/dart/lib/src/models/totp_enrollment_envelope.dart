// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'totp_enrollment_dto.dart';

part 'totp_enrollment_envelope.g.dart';

@JsonSerializable()
class TotpEnrollmentEnvelope {
  const TotpEnrollmentEnvelope({required this.data, this.meta});

  factory TotpEnrollmentEnvelope.fromJson(Map<String, Object?> json) =>
      _$TotpEnrollmentEnvelopeFromJson(json);

  final TotpEnrollmentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TotpEnrollmentEnvelopeToJson(this);
}
