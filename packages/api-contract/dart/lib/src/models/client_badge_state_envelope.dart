// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_badge_state_dto.dart';
import 'response_meta_dto.dart';

part 'client_badge_state_envelope.g.dart';

@JsonSerializable()
class ClientBadgeStateEnvelope {
  const ClientBadgeStateEnvelope({required this.data, this.meta});

  factory ClientBadgeStateEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientBadgeStateEnvelopeFromJson(json);

  final ClientBadgeStateDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientBadgeStateEnvelopeToJson(this);
}
