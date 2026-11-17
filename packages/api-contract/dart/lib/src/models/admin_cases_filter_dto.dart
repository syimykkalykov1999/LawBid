// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_status.dart';

part 'admin_cases_filter_dto.g.dart';

@JsonSerializable()
class AdminCasesFilterDto {
  const AdminCasesFilterDto({
    this.status,
    this.q,
    this.clientId,
    this.practiceAreaId,
    this.stateCode,
    this.hasReports,
    this.withDeadline,
  });

  factory AdminCasesFilterDto.fromJson(Map<String, Object?> json) =>
      _$AdminCasesFilterDtoFromJson(json);

  final AdminCaseStatus? status;

  /// Text in the title.
  final String? q;
  final String? clientId;
  final String? practiceAreaId;

  /// Any state of the case.
  final String? stateCode;

  /// Only cases with / without open reports.
  final bool? hasReports;

  /// Owner 2026-10-05: only cases with a date (court hearing, filing…) from today on.
  final bool? withDeadline;

  Map<String, Object?> toJson() => _$AdminCasesFilterDtoToJson(this);
}
