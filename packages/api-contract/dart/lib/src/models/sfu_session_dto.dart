// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_ice_server_dto.dart';

part 'sfu_session_dto.g.dart';

@JsonSerializable()
class SfuSessionDto {
  const SfuSessionDto({required this.sessionId, required this.iceServers});

  factory SfuSessionDto.fromJson(Map<String, Object?> json) =>
      _$SfuSessionDtoFromJson(json);

  /// Our handle for your Cloudflare session. Informational: every later call finds your session from your login, never from this value.
  final String sessionId;

  /// STUN for the SFU. For hard networks also use GET /calls/ice-servers (TURN).
  final List<SfuIceServerDto> iceServers;

  Map<String, Object?> toJson() => _$SfuSessionDtoToJson(this);
}
