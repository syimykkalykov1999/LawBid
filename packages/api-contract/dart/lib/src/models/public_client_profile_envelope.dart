// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_client_profile_dto.dart';
import 'response_meta_dto.dart';

part 'public_client_profile_envelope.g.dart';

@JsonSerializable()
class PublicClientProfileEnvelope {
  const PublicClientProfileEnvelope({required this.data, this.meta});

  factory PublicClientProfileEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicClientProfileEnvelopeFromJson(json);

  final PublicClientProfileDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicClientProfileEnvelopeToJson(this);
}
