// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_paid_diff_dto.dart';

part 'piecework_rerun_result_dto.g.dart';

@JsonSerializable()
class PieceworkRerunResultDto {
  const PieceworkRerunResultDto({
    required this.day,
    required this.admins,
    required this.accrued,
    required this.totalCents,
    required this.skippedNoPayroll,
    required this.skippedDisputed,
    required this.noRating,
    required this.paidDiffs,
  });

  factory PieceworkRerunResultDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkRerunResultDtoFromJson(json);

  final String day;
  final int admins;
  final int accrued;
  final int totalCents;
  final int skippedNoPayroll;
  final int skippedDisputed;
  final int noRating;

  /// Days already paid whose recount differs: add an adjustment in payroll.
  final List<PieceworkPaidDiffDto> paidDiffs;

  Map<String, Object?> toJson() => _$PieceworkRerunResultDtoToJson(this);
}
