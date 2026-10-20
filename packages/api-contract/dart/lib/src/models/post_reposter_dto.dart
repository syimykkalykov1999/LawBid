// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_reposter_dto_role.dart';

part 'post_reposter_dto.g.dart';

@JsonSerializable()
class PostReposterDto {
  const PostReposterDto({
    required this.id,
    required this.username,
    required this.name,
    required this.role,
    this.repostedAt,
  });

  factory PostReposterDto.fromJson(Map<String, Object?> json) =>
      _$PostReposterDtoFromJson(json);

  final String id;
  final String username;

  /// Display name ("First Last"), empty when none is set.
  final String name;
  final PostReposterDtoRole role;

  /// Owner 2026-10-18: when this person reposted it (profile «Брифы и.
  /// репосты» orders briefs and reposts by time); null in other lists.
  final String? repostedAt;

  Map<String, Object?> toJson() => _$PostReposterDtoToJson(this);
}
