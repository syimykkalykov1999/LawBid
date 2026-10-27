// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'desk_settings_dto.g.dart';

@JsonSerializable()
class DeskSettingsDto {
  const DeskSettingsDto({required this.switches, required this.numbers});

  factory DeskSettingsDto.fromJson(Map<String, Object?> json) =>
      _$DeskSettingsDtoFromJson(json);

  /// The `staff.*_enabled` switches the desk reads (workspaces, desk, leases per queue, presence, rating, worker progress, appeals, piecework, head). Per-queue lease switches already count only under `staff.lease_enabled`.
  final Map<String, bool> switches;

  /// Timers and capacity the desk shows (heartbeat, lease lengths per queue, warning before loss, skips per hour, capacity), clamped to their admin bounds.
  final Map<String, int> numbers;

  Map<String, Object?> toJson() => _$DeskSettingsDtoToJson(this);
}
