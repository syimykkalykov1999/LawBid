// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'free_tier_dto.g.dart';

@JsonSerializable()
class FreeTierDto {
  const FreeTierDto({
    required this.label,
    required this.used,
    required this.free,
    required this.unit,
  });

  factory FreeTierDto.fromJson(Map<String, Object?> json) =>
      _$FreeTierDtoFromJson(json);

  final String label;
  final num used;
  final num free;
  final String unit;

  Map<String, Object?> toJson() => _$FreeTierDtoToJson(this);
}
