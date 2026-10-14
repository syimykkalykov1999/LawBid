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
    required this.trustLevel,
    required this.practiceI18nKeys,
    this.firstName,
    this.lastName,
    this.avatarUrl,
    this.identityRejected,
    this.location,
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

  /// Owner 2026-10-13: Identity level 0..3 (attorneys; 0 for clients).
  final num trustLevel;

  /// Owner 2026-10-13: the attorney's verification was rejected — a red.
  /// circle on the avatar.
  final bool? identityRejected;

  /// Owner 2026-10-13: up to three practice keys under the name.
  final List<String> practiceI18nKeys;

  /// Owner 2026-10-13: attorney: licensed states ("NY, CA"); client: state.
  final String? location;

  Map<String, Object?> toJson() => _$PostAuthorDtoToJson(this);
}
