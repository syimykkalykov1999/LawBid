// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'selfie_capture_token_dto.dart';

part 'selfie_capture_token_envelope.g.dart';

@JsonSerializable()
class SelfieCaptureTokenEnvelope {
  const SelfieCaptureTokenEnvelope({required this.data, this.meta});

  factory SelfieCaptureTokenEnvelope.fromJson(Map<String, Object?> json) =>
      _$SelfieCaptureTokenEnvelopeFromJson(json);

  final SelfieCaptureTokenDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SelfieCaptureTokenEnvelopeToJson(this);
}
