// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'tag_dto.g.dart';

@JsonSerializable()
class TagDto {
  const TagDto({required this.tag, this.postsCount});

  factory TagDto.fromJson(Map<String, Object?> json) => _$TagDtoFromJson(json);

  /// Lowercase, without "#".
  final String tag;

  /// Posts in the last 7 days (trending only).
  final num? postsCount;

  Map<String, Object?> toJson() => _$TagDtoToJson(this);
}
