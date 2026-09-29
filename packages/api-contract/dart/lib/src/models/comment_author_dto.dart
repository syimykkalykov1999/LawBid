// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'comment_author_dto_kind.dart';

part 'comment_author_dto.g.dart';

@JsonSerializable()
class CommentAuthorDto {
  const CommentAuthorDto({
    required this.kind,
    required this.displayName,
    required this.verifiedBadge,
    this.attorneyId,
    this.username,
    this.avatarUrl,
  });

  factory CommentAuthorDto.fromJson(Map<String, Object?> json) =>
      _$CommentAuthorDtoFromJson(json);

  final CommentAuthorDtoKind kind;

  /// Attorneys only.
  final String? attorneyId;

  /// Attorneys only.
  final String? username;

  /// Attorney: full name; client: "Anna K."
  final String displayName;
  final String? avatarUrl;
  final bool verifiedBadge;

  Map<String, Object?> toJson() => _$CommentAuthorDtoToJson(this);
}
