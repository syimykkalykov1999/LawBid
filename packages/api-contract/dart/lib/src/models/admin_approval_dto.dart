// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_approval_dto_kind.dart';
import 'admin_approval_dto_status.dart';
import 'admin_approval_person_dto.dart';

part 'admin_approval_dto.g.dart';

@JsonSerializable()
class AdminApprovalDto {
  const AdminApprovalDto({
    required this.id,
    required this.kind,
    required this.label,
    required this.summary,
    required this.amountCents,
    required this.status,
    required this.payload,
    required this.requestedBy,
    required this.approvedBy,
    required this.rejectedBy,
    required this.decisionNote,
    required this.error,
    required this.createdAt,
    required this.decidedAt,
    required this.executedAt,
    required this.expiresAt,
    required this.canDecide,
    required this.mine,
  });

  factory AdminApprovalDto.fromJson(Map<String, Object?> json) =>
      _$AdminApprovalDtoFromJson(json);

  final String id;
  final AdminApprovalDtoKind kind;

  /// Russian label of the kind.
  final String label;
  final String summary;

  /// Compared with the limit (cents).
  final int amountCents;
  final AdminApprovalDtoStatus status;

  /// The request body the action runs with.
  final dynamic payload;
  final AdminApprovalPersonDto requestedBy;
  final AdminApprovalPersonDto? approvedBy;
  final AdminApprovalPersonDto? rejectedBy;
  final String? decisionNote;
  final String? error;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final DateTime? executedAt;
  final DateTime expiresAt;

  /// The viewer may approve or reject it now.
  final bool canDecide;

  /// The viewer asked for it.
  final bool mine;

  Map<String, Object?> toJson() => _$AdminApprovalDtoToJson(this);
}
