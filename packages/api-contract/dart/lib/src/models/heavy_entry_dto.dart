// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'heavy_entry_dto.g.dart';

@JsonSerializable()
class HeavyEntryDto {
  const HeavyEntryDto({
    required this.id,
    required this.score,
    required this.label,
    required this.role,
  });

  factory HeavyEntryDto.fromJson(Map<String, Object?> json) =>
      _$HeavyEntryDtoFromJson(json);

  /// User id or case id.
  final String id;

  /// Score over the window: requests, DB milliseconds, upload bytes or messages (sampled metrics are scaled back up).
  final num score;

  /// User name (user rows) or case title (case rows).
  final String? label;

  /// User role (user rows only).
  final String? role;

  Map<String, Object?> toJson() => _$HeavyEntryDtoToJson(this);
}
