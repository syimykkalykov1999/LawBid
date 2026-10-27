// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_day_dto_status.dart';
import 'piecework_kind_dto.dart';

part 'piecework_day_dto.g.dart';

@JsonSerializable()
class PieceworkDayDto {
  const PieceworkDayDto({
    required this.day,
    required this.units,
    required this.heldUnits,
    required this.qualityMult,
    required this.amountCents,
    required this.status,
    required this.noRating,
    this.kinds,
  });

  factory PieceworkDayDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkDayDtoFromJson(json);

  final String day;
  final int units;
  final int heldUnits;
  final num qualityMult;
  final int amountCents;
  final PieceworkDayDtoStatus status;

  /// No rating snapshot: counted at ×1.00.
  final bool noRating;

  /// Per kind with the rate used; the owner only.
  final List<PieceworkKindDto>? kinds;

  Map<String, Object?> toJson() => _$PieceworkDayDtoToJson(this);
}
