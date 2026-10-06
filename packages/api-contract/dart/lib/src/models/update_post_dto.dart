// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_content_class.dart';

part 'update_post_dto.g.dart';

@JsonSerializable()
class UpdatePostDto {
  const UpdatePostDto({
    required this.body,
    this.title,
    this.practiceCode,
    this.contentClass,
  });

  factory UpdatePostDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePostDtoFromJson(json);

  final String? title;
  final String? practiceCode;

  /// Owner 2026-10-05: 'legal' or 'general'. A post with a law topic or.
  /// News is always legal; without one the author picks (default general).
  final PostContentClass? contentClass;
  final String body;

  Map<String, Object?> toJson() => _$UpdatePostDtoToJson(this);
}
