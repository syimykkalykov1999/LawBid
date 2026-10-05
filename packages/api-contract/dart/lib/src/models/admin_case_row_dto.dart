// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_row_dto_dossier_missing.dart';
import 'admin_case_row_dto_status.dart';
import 'case_deadline_kind.dart';
import 'case_urgency.dart';
import 'case_urgency_level.dart';

part 'admin_case_row_dto.g.dart';

@JsonSerializable()
class AdminCaseRowDto {
  const AdminCaseRowDto({
    required this.id,
    required this.title,
    required this.status,
    required this.clientId,
    required this.clientName,
    required this.practiceAreaId,
    required this.practiceAreaName,
    required this.stateCode,
    required this.bidsCount,
    required this.commentCount,
    required this.viewCount,
    required this.openReports,
    required this.promoted,
    required this.imagesCount,
    required this.documentsCount,
    required this.dossierScore,
    required this.dossierMissing,
    required this.urgency,
    required this.urgencyLevel,
    required this.deadlineAt,
    required this.deadlineKind,
    required this.lastActivityAt,
    required this.createdAt,
  });

  factory AdminCaseRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseRowDtoFromJson(json);

  final String id;
  final String title;
  final AdminCaseRowDtoStatus status;
  final String clientId;
  final String clientName;
  final String practiceAreaId;
  final String practiceAreaName;
  final String stateCode;
  final int bidsCount;
  final int commentCount;
  final int viewCount;
  final int openReports;

  /// A paid / granted promotion is running.
  final bool promoted;

  /// Owner 2026-10-05: the case dossier ("4 of 6").
  final int imagesCount;
  final int documentsCount;

  /// Filled-in items, 0–6.
  final int dossierScore;

  /// Dossier items the client has not filled in.
  final List<AdminCaseRowDtoDossierMissing> dossierMissing;
  final CaseUrgency? urgency;
  final CaseUrgencyLevel? urgencyLevel;
  final DateTime? deadlineAt;
  final CaseDeadlineKind? deadlineKind;
  final DateTime lastActivityAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminCaseRowDtoToJson(this);
}
