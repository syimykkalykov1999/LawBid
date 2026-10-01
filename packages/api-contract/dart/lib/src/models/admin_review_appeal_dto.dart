// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_review_appeal_dto_author_role.dart';
import 'review_appeal_status.dart';

part 'admin_review_appeal_dto.g.dart';

@JsonSerializable()
class AdminReviewAppealDto {
  const AdminReviewAppealDto({
    required this.id,
    required this.status,
    required this.reason,
    required this.createdAt,
    required this.autoRemoveAt,
    required this.reviewId,
    required this.rating,
    required this.authorName,
    required this.authorRole,
    required this.clientId,
    required this.clientName,
    this.body,
  });

  factory AdminReviewAppealDto.fromJson(Map<String, Object?> json) =>
      _$AdminReviewAppealDtoFromJson(json);

  final String id;
  final ReviewAppealStatus status;
  final String reason;
  final String createdAt;

  /// Removed automatically then unless decided.
  final String autoRemoveAt;
  final String reviewId;
  final int rating;
  final String? body;
  final String authorName;
  final AdminReviewAppealDtoAuthorRole authorRole;
  final String clientId;
  final String clientName;

  Map<String, Object?> toJson() => _$AdminReviewAppealDtoToJson(this);
}
