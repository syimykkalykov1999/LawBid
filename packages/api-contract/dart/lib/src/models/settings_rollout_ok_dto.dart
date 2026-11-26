// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'settings_rollout_ok_dto.g.dart';

@JsonSerializable()
class SettingsRolloutOkDto {
  const SettingsRolloutOkDto({required this.ok});

  factory SettingsRolloutOkDto.fromJson(Map<String, Object?> json) =>
      _$SettingsRolloutOkDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$SettingsRolloutOkDtoToJson(this);
}
