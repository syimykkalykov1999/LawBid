// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'public_review_dto.g.dart';

@JsonSerializable()
class PublicReviewDto {
  const PublicReviewDto({
    required this.id,
    required this.rating,
    required this.body,
    required this.authorDisplayName,
    required this.createdAt,
    required this.editedAt,
  });

  factory PublicReviewDto.fromJson(Map<String, Object?> json) =>
      _$PublicReviewDtoFromJson(json);

  final String id;
  final int rating;
  final String? body;

  /// Reviewer as "First L." (docs/03 §7.4); null when the account has no name (show a localized placeholder).
  final String? authorDisplayName;
  final DateTime createdAt;

  /// Set when the client edited the review ("Edited" label).
  final DateTime? editedAt;

  Map<String, Object?> toJson() => _$PublicReviewDtoToJson(this);
}
