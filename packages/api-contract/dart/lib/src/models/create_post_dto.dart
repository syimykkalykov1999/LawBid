// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_kind.dart';

part 'create_post_dto.g.dart';

@JsonSerializable()
class CreatePostDto {
  const CreatePostDto({
    required this.title,
    required this.body,
    this.kind = PostKind.post,
    this.practiceCode,
    this.mediaFileIds,
  });

  factory CreatePostDto.fromJson(Map<String, Object?> json) =>
      _$CreatePostDtoFromJson(json);

  /// Owner 2026-09-30: the card's title.
  final String title;

  /// Owner 2026-09-30: the qualification — a practice category or.
  /// subcategory code (`civil_litigation`, `civil_litigation.appeals`…).
  final String? practiceCode;

  /// Owner 2026-09-30: News — attorneys only.
  final PostKind kind;
  final String body;

  /// Clean post_image file ids, in display order.
  final List<String>? mediaFileIds;

  Map<String, Object?> toJson() => _$CreatePostDtoToJson(this);
}
