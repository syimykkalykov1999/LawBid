// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_client_review_row_dto_appeal_status.dart';
import 'admin_client_review_row_dto_author_role.dart';
import 'admin_client_review_row_dto_status.dart';

part 'admin_client_review_row_dto.g.dart';

@JsonSerializable()
class AdminClientReviewRowDto {
  const AdminClientReviewRowDto({
    required this.id,
    required this.rating,
    required this.authorId,
    required this.authorName,
    required this.authorRole,
    required this.clientId,
    required this.clientName,
    required this.status,
    required this.createdAt,
    this.body,
    this.caseTitle,
    this.appealStatus,
  });

  factory AdminClientReviewRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientReviewRowDtoFromJson(json);

  final String id;
  final int rating;
  final String? body;
  final String authorId;
  final String authorName;
  final AdminClientReviewRowDtoAuthorRole authorRole;
  final String clientId;
  final String clientName;
  final String? caseTitle;
  final AdminClientReviewRowDtoStatus status;

  /// The reviewed client's appeal, if any.
  final AdminClientReviewRowDtoAppealStatus? appealStatus;
  final String createdAt;

  Map<String, Object?> toJson() => _$AdminClientReviewRowDtoToJson(this);
}
