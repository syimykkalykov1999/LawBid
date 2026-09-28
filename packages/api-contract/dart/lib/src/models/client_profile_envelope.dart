// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_profile_dto.dart';
import 'response_meta_dto.dart';

part 'client_profile_envelope.g.dart';

@JsonSerializable()
class ClientProfileEnvelope {
  const ClientProfileEnvelope({required this.data, this.meta});

  factory ClientProfileEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientProfileEnvelopeFromJson(json);

  final ClientProfileDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientProfileEnvelopeToJson(this);
}
