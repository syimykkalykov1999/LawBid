// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_cases_bulk_action.dart';

part 'admin_cases_bulk_dto.g.dart';

@JsonSerializable()
class AdminCasesBulkDto {
  const AdminCasesBulkDto({
    required this.action,
    required this.ids,
    this.reason = '',
  });

  factory AdminCasesBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminCasesBulkDtoFromJson(json);

  final String reason;
  final AdminCasesBulkAction action;
  final List<String> ids;

  Map<String, Object?> toJson() => _$AdminCasesBulkDtoToJson(this);
}
