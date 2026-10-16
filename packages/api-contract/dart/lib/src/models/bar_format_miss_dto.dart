// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bar_format_miss_dto.g.dart';

@JsonSerializable()
class BarFormatMissDto {
  const BarFormatMissDto({
    required this.stateCode,
    required this.shape,
    required this.hits,
    required this.lastSeen,
  });

  factory BarFormatMissDto.fromJson(Map<String, Object?> json) =>
      _$BarFormatMissDtoFromJson(json);

  final String stateCode;

  /// The shape of a number no rule recognised (9 = digit, A = letter).
  final String shape;
  final num hits;
  final DateTime lastSeen;

  Map<String, Object?> toJson() => _$BarFormatMissDtoToJson(this);
}
