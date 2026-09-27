// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'i18n_changed_entry_dto.dart';
import 'i18n_import_error_dto.dart';
import 'i18n_import_mode.dart';

part 'i18n_import_report_dto.g.dart';

@JsonSerializable()
class I18nImportReportDto {
  const I18nImportReportDto({
    required this.mode,
    required this.valid,
    required this.applied,
    required this.newLanguages,
    required this.newKeys,
    required this.changedKeys,
    required this.unchangedCount,
    required this.errors,
  });

  factory I18nImportReportDto.fromJson(Map<String, Object?> json) =>
      _$I18nImportReportDtoFromJson(json);

  final I18nImportMode mode;

  /// False when `errors` is non-empty.
  final bool valid;

  /// True only for a valid `apply` run.
  final bool applied;
  final List<String> newLanguages;
  final List<String> newKeys;
  final List<I18nChangedEntryDto> changedKeys;
  final int unchangedCount;
  final List<I18nImportErrorDto> errors;

  Map<String, Object?> toJson() => _$I18nImportReportDtoToJson(this);
}
