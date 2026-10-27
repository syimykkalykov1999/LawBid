// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_suggestion_kind.dart';
import 'staff_suggestion_status.dart';
import 'staff_workspace_name.dart';

part 'staff_suggestion_dto.g.dart';

@JsonSerializable()
class StaffSuggestionDto {
  const StaffSuggestionDto({
    required this.id,
    required this.adminId,
    required this.name,
    required this.workspace,
    required this.kind,
    required this.status,
    required this.snapshotDate,
    required this.evidence,
    required this.createdAt,
  });

  factory StaffSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$StaffSuggestionDtoFromJson(json);

  final String id;
  final String adminId;
  final String name;
  final StaffWorkspaceName workspace;
  final StaffSuggestionKind kind;
  final StaffSuggestionStatus status;
  final String snapshotDate;
  final dynamic evidence;
  final String createdAt;

  Map<String, Object?> toJson() => _$StaffSuggestionDtoToJson(this);
}
