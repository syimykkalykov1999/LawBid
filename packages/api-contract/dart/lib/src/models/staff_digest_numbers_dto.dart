// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_digest_numbers_dto.g.dart';

@JsonSerializable()
class StaffDigestNumbersDto {
  const StaffDigestNumbersDto({
    required this.decisions,
    required this.returnedPct,
    required this.appeals,
    required this.worstCount,
    required this.bestCount,
    required this.worstName,
    required this.bestName,
    required this.pieceworkCents,
    required this.currency,
  });

  factory StaffDigestNumbersDto.fromJson(Map<String, Object?> json) =>
      _$StaffDigestNumbersDtoFromJson(json);

  /// Decisions of the week.
  final int decisions;

  /// Share of decisions that came back, percent.
  final num? returnedPct;

  /// New complaints about heads.
  final int appeals;

  /// Red + yellow people.
  final int worstCount;

  /// Green people.
  final int bestCount;
  final String? worstName;
  final String? bestName;

  /// Piecework pay of the week.
  final int pieceworkCents;
  final String currency;

  Map<String, Object?> toJson() => _$StaffDigestNumbersDtoToJson(this);
}
