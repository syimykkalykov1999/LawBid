// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'passkey_registration_options_dto.dart';
import 'response_meta_dto.dart';

part 'passkey_registration_options_envelope.g.dart';

@JsonSerializable()
class PasskeyRegistrationOptionsEnvelope {
  const PasskeyRegistrationOptionsEnvelope({required this.data, this.meta});

  factory PasskeyRegistrationOptionsEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$PasskeyRegistrationOptionsEnvelopeFromJson(json);

  final PasskeyRegistrationOptionsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$PasskeyRegistrationOptionsEnvelopeToJson(this);
}
