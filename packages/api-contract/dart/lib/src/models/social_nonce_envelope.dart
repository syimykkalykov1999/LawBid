// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'social_nonce_dto.dart';

part 'social_nonce_envelope.g.dart';

@JsonSerializable()
class SocialNonceEnvelope {
  const SocialNonceEnvelope({required this.data, this.meta});

  factory SocialNonceEnvelope.fromJson(Map<String, Object?> json) =>
      _$SocialNonceEnvelopeFromJson(json);

  final SocialNonceDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SocialNonceEnvelopeToJson(this);
}
