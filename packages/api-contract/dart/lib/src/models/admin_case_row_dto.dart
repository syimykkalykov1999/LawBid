// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_row_dto_status.dart';

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
  final DateTime lastActivityAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminCaseRowDtoToJson(this);
}
