// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_author_dto_role.dart';

part 'post_author_dto.g.dart';

@JsonSerializable()
class PostAuthorDto {
  const PostAuthorDto({
    required this.id,
    required this.role,
    required this.username,
    required this.verifiedBadge,
    required this.isFollowing,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });

  factory PostAuthorDto.fromJson(Map<String, Object?> json) =>
      _$PostAuthorDtoFromJson(json);

  final String id;

  /// OQ-038: clients publish posts too.
  final PostAuthorDtoRole role;
  final String username;
  final String? firstName;
  final String? lastName;

  /// 256 px avatar link.
  final String? avatarUrl;

  /// Blue check (docs/03 §6.3).
  final bool verifiedBadge;

  /// Owner 2026-09-30: the viewer follows this author (card Follow).
  final bool isFollowing;

  Map<String, Object?> toJson() => _$PostAuthorDtoToJson(this);
}
