// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_post_dto.g.dart';

@JsonSerializable()
class CreatePostDto {
  const CreatePostDto({required this.body, this.mediaFileIds});

  factory CreatePostDto.fromJson(Map<String, Object?> json) =>
      _$CreatePostDtoFromJson(json);

  final String body;

  /// Clean post_image file ids, in display order.
  final List<String>? mediaFileIds;

  Map<String, Object?> toJson() => _$CreatePostDtoToJson(this);
}
