// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'settings_revert_result_dto.g.dart';

@JsonSerializable()
class SettingsRevertResultDto {
  const SettingsRevertResultDto({required this.keys});

  factory SettingsRevertResultDto.fromJson(Map<String, Object?> json) =>
      _$SettingsRevertResultDtoFromJson(json);

  final List<String> keys;

  Map<String, Object?> toJson() => _$SettingsRevertResultDtoToJson(this);
}
