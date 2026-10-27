// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_day_dto.dart';
import 'piecework_person_dto_workspace.dart';

part 'piecework_person_dto.g.dart';

@JsonSerializable()
class PieceworkPersonDto {
  const PieceworkPersonDto({
    required this.adminId,
    required this.name,
    required this.workspace,
    required this.units,
    required this.heldUnits,
    required this.days,
    this.amountCents,
  });

  factory PieceworkPersonDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkPersonDtoFromJson(json);

  final String adminId;
  final String name;
  final PieceworkPersonDtoWorkspace workspace;
  final int units;
  final int heldUnits;

  /// Month total, cents; hidden from a head (totals only).
  final num? amountCents;

  /// Empty for a head (totals only).
  final List<PieceworkDayDto> days;

  Map<String, Object?> toJson() => _$PieceworkPersonDtoToJson(this);
}
