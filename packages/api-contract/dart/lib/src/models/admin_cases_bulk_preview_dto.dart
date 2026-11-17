// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_cases_filter_dto.dart';

part 'admin_cases_bulk_preview_dto.g.dart';

@JsonSerializable()
class AdminCasesBulkPreviewDto {
  const AdminCasesBulkPreviewDto({required this.filter});

  factory AdminCasesBulkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminCasesBulkPreviewDtoFromJson(json);

  final AdminCasesFilterDto filter;

  Map<String, Object?> toJson() => _$AdminCasesBulkPreviewDtoToJson(this);
}
