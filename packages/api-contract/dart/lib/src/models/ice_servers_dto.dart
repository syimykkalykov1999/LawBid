// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ice_server_dto.dart';

part 'ice_servers_dto.g.dart';

@JsonSerializable()
class IceServersDto {
  const IceServersDto({required this.iceServers, required this.ttlSec});

  factory IceServersDto.fromJson(Map<String, Object?> json) =>
      _$IceServersDtoFromJson(json);

  final List<IceServerDto> iceServers;

  /// Seconds the TURN login lives.
  final int ttlSec;

  Map<String, Object?> toJson() => _$IceServersDtoToJson(this);
}
