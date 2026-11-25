// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_heartbeat_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_heartbeat_envelope.g.dart';

@JsonSerializable()
class HotlineHeartbeatEnvelope {
  const HotlineHeartbeatEnvelope({required this.data, this.meta});

  factory HotlineHeartbeatEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineHeartbeatEnvelopeFromJson(json);

  final HotlineHeartbeatDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineHeartbeatEnvelopeToJson(this);
}
