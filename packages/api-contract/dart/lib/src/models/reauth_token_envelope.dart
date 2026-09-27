// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reauth_token_dto.dart';
import 'response_meta_dto.dart';

part 'reauth_token_envelope.g.dart';

@JsonSerializable()
class ReauthTokenEnvelope {
  const ReauthTokenEnvelope({required this.data, this.meta});

  factory ReauthTokenEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReauthTokenEnvelopeFromJson(json);

  final ReauthTokenDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReauthTokenEnvelopeToJson(this);
}
