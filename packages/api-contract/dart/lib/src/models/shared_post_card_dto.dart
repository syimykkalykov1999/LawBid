// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'shared_post_author_dto.dart';

part 'shared_post_card_dto.g.dart';

@JsonSerializable()
class SharedPostCardDto {
  const SharedPostCardDto({
    required this.id,
    required this.isVideo,
    required this.available,
    this.author,
    this.title,
    this.excerpt,
    this.thumbnailUrl,
  });

  factory SharedPostCardDto.fromJson(Map<String, Object?> json) =>
      _$SharedPostCardDtoFromJson(json);

  final String id;
  final SharedPostAuthorDto? author;
  final String? title;

  /// The start of the text (≤200 chars).
  final String? excerpt;

  /// The first photo, or the video cover.
  final String? thumbnailUrl;

  /// A video post / reel (the card shows ▶).
  final bool isVideo;

  /// False once the post is gone or hidden.
  final bool available;

  Map<String, Object?> toJson() => _$SharedPostCardDtoToJson(this);
}
