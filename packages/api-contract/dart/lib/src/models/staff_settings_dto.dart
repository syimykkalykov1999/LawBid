// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_settings_dto.g.dart';

@JsonSerializable()
class StaffSettingsDto {
  const StaffSettingsDto({required this.switches, required this.numbers});

  factory StaffSettingsDto.fromJson(Map<String, Object?> json) =>
      _$StaffSettingsDtoFromJson(json);

  /// Switches `staff.*_enabled` (all false by default). AI sub-switches count only with staff.ai_enabled, per-queue lease switches only with staff.lease_enabled.
  final Map<String, bool> switches;

  /// Thresholds and limits (`staff.*`), clamped to their admin bounds.
  final Map<String, int> numbers;

  Map<String, Object?> toJson() => _$StaffSettingsDtoToJson(this);
}
