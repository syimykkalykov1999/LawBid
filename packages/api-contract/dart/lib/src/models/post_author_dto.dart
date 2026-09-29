// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_author_dto.g.dart';

@JsonSerializable()
class PostAuthorDto {
  const PostAuthorDto({
    required this.id,
    required this.username,
    required this.verifiedBadge,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });

  factory PostAuthorDto.fromJson(Map<String, Object?> json) =>
      _$PostAuthorDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;

  /// 256 px avatar link.
  final String? avatarUrl;

  /// Blue check (docs/03 §6.3).
  final bool verifiedBadge;

  Map<String, Object?> toJson() => _$PostAuthorDtoToJson(this);
}
