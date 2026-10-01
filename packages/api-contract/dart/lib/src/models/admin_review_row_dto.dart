// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_review_row_dto_status.dart';

part 'admin_review_row_dto.g.dart';

@JsonSerializable()
class AdminReviewRowDto {
  const AdminReviewRowDto({
    required this.id,
    required this.rating,
    required this.attorneyName,
    required this.clientName,
    required this.status,
    required this.createdAt,
    this.body,
    this.caseTitle,
  });

  factory AdminReviewRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminReviewRowDtoFromJson(json);

  final String id;
  final int rating;
  final String? body;
  final String attorneyName;
  final String clientName;

  /// null = an open review (no shared case, owner 2026-10-01).
  final String? caseTitle;
  final AdminReviewRowDtoStatus status;
  final String createdAt;

  Map<String, Object?> toJson() => _$AdminReviewRowDtoToJson(this);
}
