// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_summary_dto.dart';
import 'admin_dispute_dto_opened_by_role.dart';

part 'admin_dispute_dto.g.dart';

@JsonSerializable()
class AdminDisputeDto {
  const AdminDisputeDto({
    required this.id,
    required this.status,
    required this.reason,
    required this.openedBy,
    required this.openedByRole,
    required this.createdAt,
    required this.resolvedAt,
    required this.resolvedBy,
    required this.resolutionNote,
    required this.caseValue,
  });

  factory AdminDisputeDto.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeDtoFromJson(json);

  final String id;
  final String status;
  final String reason;
  final String openedBy;
  final AdminDisputeDtoOpenedByRole? openedByRole;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final String? resolvedBy;
  final String? resolutionNote;

  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonKey(name: 'case')
  final AdminCaseSummaryDto caseValue;

  Map<String, Object?> toJson() => _$AdminDisputeDtoToJson(this);
}
