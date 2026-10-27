// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'piecework_totals_dto.g.dart';

@JsonSerializable()
class PieceworkTotalsDto {
  const PieceworkTotalsDto({
    required this.people,
    required this.units,
    required this.heldUnits,
    required this.amountCents,
  });

  factory PieceworkTotalsDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkTotalsDtoFromJson(json);

  final int people;
  final int units;
  final int heldUnits;
  final int amountCents;

  Map<String, Object?> toJson() => _$PieceworkTotalsDtoToJson(this);
}
