// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'passkey_authentication_options_dto.dart';
import 'response_meta_dto.dart';

part 'passkey_authentication_options_envelope.g.dart';

@JsonSerializable()
class PasskeyAuthenticationOptionsEnvelope {
  const PasskeyAuthenticationOptionsEnvelope({
    required this.data,
    this.meta,
  });
  
  factory PasskeyAuthenticationOptionsEnvelope.fromJson(Map<String, Object?> json) => _$PasskeyAuthenticationOptionsEnvelopeFromJson(json);
  
  final PasskeyAuthenticationOptionsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PasskeyAuthenticationOptionsEnvelopeToJson(this);
}
