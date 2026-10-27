// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_kind_dto_kind.dart';

part 'piecework_kind_dto.g.dart';

@JsonSerializable()
class PieceworkKindDto {
  const PieceworkKindDto({
    required this.kind,
    required this.units,
    required this.heldUnits,
    required this.rateCents,
    required this.amountCents,
  });

  factory PieceworkKindDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkKindDtoFromJson(json);

  final PieceworkKindDtoKind kind;
  final int units;

  /// Overturned on re-check, not paid.
  final int heldUnits;
  final int rateCents;
  final int amountCents;

  Map<String, Object?> toJson() => _$PieceworkKindDtoToJson(this);
}
