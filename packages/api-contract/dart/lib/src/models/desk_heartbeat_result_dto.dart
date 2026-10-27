// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_presence.dart';

part 'desk_heartbeat_result_dto.g.dart';

@JsonSerializable()
class DeskHeartbeatResultDto {
  const DeskHeartbeatResultDto({required this.status});

  factory DeskHeartbeatResultDto.fromJson(Map<String, Object?> json) =>
      _$DeskHeartbeatResultDtoFromJson(json);

  final DeskPresence status;

  Map<String, Object?> toJson() => _$DeskHeartbeatResultDtoToJson(this);
}
