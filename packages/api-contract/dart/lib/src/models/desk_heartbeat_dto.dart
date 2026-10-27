// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'desk_heartbeat_dto.g.dart';

@JsonSerializable()
class DeskHeartbeatDto {
  const DeskHeartbeatDto({required this.active});

  factory DeskHeartbeatDto.fromJson(Map<String, Object?> json) =>
      _$DeskHeartbeatDtoFromJson(json);

  /// true when the person moved the mouse or pressed a key in the last few minutes.
  final bool active;

  Map<String, Object?> toJson() => _$DeskHeartbeatDtoToJson(this);
}
