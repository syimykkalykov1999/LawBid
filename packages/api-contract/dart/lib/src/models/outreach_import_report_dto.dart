// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_import_report_dto_mode.dart';

part 'outreach_import_report_dto.g.dart';

@JsonSerializable()
class OutreachImportReportDto {
  const OutreachImportReportDto({
    required this.mode,
    required this.rows,
    required this.created,
    required this.duplicates,
    required this.suppressed,
    required this.skipped,
    required this.columns,
    required this.problems,
  });

  factory OutreachImportReportDto.fromJson(Map<String, Object?> json) =>
      _$OutreachImportReportDtoFromJson(json);

  final OutreachImportReportDtoMode mode;

  /// Rows that are leads (have an email or phone).
  final num rows;

  /// Would be / were created.
  final num created;

  /// Email or phone already in the base.
  final num duplicates;

  /// Email or phone on the stop-list; not created.
  final num suppressed;

  /// Rows without any contact.
  final num skipped;
  final List<String> columns;

  /// First few problems, "row 12: no_contact".
  final List<String> problems;

  Map<String, Object?> toJson() => _$OutreachImportReportDtoToJson(this);
}
