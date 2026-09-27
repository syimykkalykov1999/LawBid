// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auth_tokens_dto.dart';
import 'response_meta_dto.dart';

part 'auth_tokens_envelope.g.dart';

@JsonSerializable()
class AuthTokensEnvelope {
  const AuthTokensEnvelope({required this.data, this.meta});

  factory AuthTokensEnvelope.fromJson(Map<String, Object?> json) =>
      _$AuthTokensEnvelopeFromJson(json);

  final AuthTokensDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AuthTokensEnvelopeToJson(this);
}
