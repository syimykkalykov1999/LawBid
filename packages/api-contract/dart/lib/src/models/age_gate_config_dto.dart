// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'age_gate_config_dto.g.dart';

@JsonSerializable()
class AgeGateConfigDto {
  const AgeGateConfigDto({
    required this.mode,
    required this.minAge,
    required this.textVersion,
    required this.requireBirthDate,
  });

  factory AgeGateConfigDto.fromJson(Map<String, Object?> json) =>
      _$AgeGateConfigDtoFromJson(json);

  /// off | record | enforce
  final String mode;
  final num minAge;
  final String textVersion;
  final bool requireBirthDate;

  Map<String, Object?> toJson() => _$AgeGateConfigDtoToJson(this);
}
