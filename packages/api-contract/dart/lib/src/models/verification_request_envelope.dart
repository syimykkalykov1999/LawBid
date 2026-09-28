// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'verification_request_dto.dart';

part 'verification_request_envelope.g.dart';

@JsonSerializable()
class VerificationRequestEnvelope {
  const VerificationRequestEnvelope({required this.data, this.meta});

  factory VerificationRequestEnvelope.fromJson(Map<String, Object?> json) =>
      _$VerificationRequestEnvelopeFromJson(json);

  final VerificationRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$VerificationRequestEnvelopeToJson(this);
}
