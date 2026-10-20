// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sign_verify_dto.dart';

part 'sign_verify_envelope.g.dart';

@JsonSerializable()
class SignVerifyEnvelope {
  const SignVerifyEnvelope({required this.data, this.meta});

  factory SignVerifyEnvelope.fromJson(Map<String, Object?> json) =>
      _$SignVerifyEnvelopeFromJson(json);

  final SignVerifyDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SignVerifyEnvelopeToJson(this);
}
