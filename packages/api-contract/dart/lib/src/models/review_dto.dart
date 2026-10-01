// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_author_role.dart';
import 'review_status.dart';

part 'review_dto.g.dart';

@JsonSerializable()
class ReviewDto {
  const ReviewDto({
    required this.id,
    required this.rating,
    required this.body,
    required this.authorDisplayName,
    required this.createdAt,
    required this.editedAt,
    required this.fromCase,
    required this.authorRole,
    required this.reply,
    required this.replyAt,
    required this.helpfulCount,
    required this.helpfulByMe,
    required this.isMine,
    required this.caseId,
    required this.attorneyId,
    required this.status,
    required this.editableUntil,
    required this.editable,
  });

  factory ReviewDto.fromJson(Map<String, Object?> json) =>
      _$ReviewDtoFromJson(json);

  final String id;
  final int rating;
  final String? body;

  /// Reviewer as "First L." (docs/03 §7.4); null when the account has no name (show a localized placeholder).
  final String? authorDisplayName;
  final DateTime createdAt;

  /// Set when the client edited the review ("Edited" label).
  final DateTime? editedAt;

  /// Verified by a closed case.
  final bool fromCase;
  final ReviewAuthorRole authorRole;

  /// The attorney's public reply.
  final String? reply;
  final DateTime? replyAt;
  final int helpfulCount;

  /// I marked it helpful.
  final bool helpfulByMe;

  /// I wrote it (edit / delete).
  final bool isMine;
  final String? caseId;
  final String attorneyId;
  final ReviewStatus status;

  /// Last moment the client may edit (created + review.edit_window_days).
  final DateTime editableUntil;

  /// True while PATCH /reviews/:id is allowed: still published and before editableUntil.
  final bool editable;

  Map<String, Object?> toJson() => _$ReviewDtoToJson(this);
}
