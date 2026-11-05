// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ice_server_dto.dart';
import 'ice_servers_dto_ice_transport_policy.dart';

part 'ice_servers_dto.g.dart';

@JsonSerializable()
class IceServersDto {
  const IceServersDto({
    required this.iceServers,
    required this.ttlSec,
    this.iceTransportPolicy,
  });

  factory IceServersDto.fromJson(Map<String, Object?> json) =>
      _$IceServersDtoFromJson(json);

  final List<IceServerDto> iceServers;

  /// Seconds the TURN login lives.
  final int ttlSec;

  /// relay = media only through the relay in this list (owner 2026-11-04); all = any route. Older apps ignore it.
  final IceServersDtoIceTransportPolicy? iceTransportPolicy;

  Map<String, Object?> toJson() => _$IceServersDtoToJson(this);
}
