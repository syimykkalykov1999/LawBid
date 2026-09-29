// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'config_entry_dto_type.dart';

part 'config_entry_dto.g.dart';

@JsonSerializable()
class ConfigEntryDto {
  const ConfigEntryDto({
    required this.key,
    required this.type,
    required this.value,
    required this.defaultValue,
    required this.description,
    required this.min,
    required this.max,
    required this.stored,
    required this.updatedAt,
  });

  factory ConfigEntryDto.fromJson(Map<String, Object?> json) =>
      _$ConfigEntryDtoFromJson(json);

  final String key;
  final ConfigEntryDtoType type;

  /// Current value (default when the row is missing).
  final dynamic value;

  /// Spec default.
  final dynamic defaultValue;
  final String? description;
  final num? min;
  final num? max;

  /// A row exists in app_config (else the default applies).
  final bool stored;
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$ConfigEntryDtoToJson(this);
}
