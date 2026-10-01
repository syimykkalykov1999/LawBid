// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_review_author_dto.dart';
import 'review_appeal_status.dart';

part 'client_review_dto.g.dart';

@JsonSerializable()
class ClientReviewDto {
  const ClientReviewDto({
    required this.id,
    required this.rating,
    required this.attorney,
    required this.isMine,
    required this.canAppeal,
    required this.canReply,
    required this.reply,
    required this.replyAt,
    required this.helpfulCount,
    required this.helpfulByMe,
    required this.editedAt,
    required this.createdAt,
    this.caseId,
    this.caseTitle,
    this.body,
    this.appealStatus,
  });

  factory ClientReviewDto.fromJson(Map<String, Object?> json) =>
      _$ClientReviewDtoFromJson(json);

  final String id;

  /// Null for a review written without a shared case.
  final String? caseId;
  final String? caseTitle;
  final int rating;
  final String? body;
  final ClientReviewAuthorDto attorney;
  final bool isMine;

  /// Deprecated (owner 2026-10-01, Google-style): always false — the.
  /// reviewed person replies or flags the review instead.
  final bool canAppeal;

  /// The viewer is the reviewed person (may reply).
  final bool canReply;
  final String? reply;
  final DateTime? replyAt;
  final int helpfulCount;
  final bool helpfulByMe;
  final DateTime? editedAt;

  /// Owner 2026-09-30: the appeal's state — shown to the client and the.
  /// author only (null for others or without an appeal).
  final ReviewAppealStatus? appealStatus;
  final String createdAt;

  Map<String, Object?> toJson() => _$ClientReviewDtoToJson(this);
}
