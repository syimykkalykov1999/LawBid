// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_waiting_dto.dart';

part 'hotline_heartbeat_dto.g.dart';

@JsonSerializable()
class HotlineHeartbeatDto {
  const HotlineHeartbeatDto({
    required this.ok,
    required this.seconds,
    this.waiting,
  });

  factory HotlineHeartbeatDto.fromJson(Map<String, Object?> json) =>
      _$HotlineHeartbeatDtoFromJson(json);

  final bool ok;

  /// Always 0 (the shape of HotlineEndDto).
  final num seconds;

  /// In a hotline call with «Принимать звонки» on: the client who waits longest in his queues.
  final HotlineWaitingDto? waiting;

  Map<String, Object?> toJson() => _$HotlineHeartbeatDtoToJson(this);
}
