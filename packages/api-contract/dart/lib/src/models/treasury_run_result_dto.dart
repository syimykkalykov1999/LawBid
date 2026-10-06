// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'treasury_run_result_dto_skipped.dart';

part 'treasury_run_result_dto.g.dart';

@JsonSerializable()
class TreasuryRunResultDto {
  const TreasuryRunResultDto({
    required this.skipped,
    required this.expensesCents,
    required this.profitCents,
    required this.shortfallCents,
  });

  factory TreasuryRunResultDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryRunResultDtoFromJson(json);

  /// Why nothing was sent (null: the split ran).
  final TreasuryRunResultDtoSkipped? skipped;
  final int expensesCents;
  final int profitCents;
  final int shortfallCents;

  Map<String, Object?> toJson() => _$TreasuryRunResultDtoToJson(this);
}
