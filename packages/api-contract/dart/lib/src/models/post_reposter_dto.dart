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
    required this.role,
  });

  factory PostReposterDto.fromJson(Map<String, Object?> json) =>
      _$PostReposterDtoFromJson(json);

  final String id;
  final String username;
  final PostReposterDtoRole role;

  Map<String, Object?> toJson() => _$PostReposterDtoToJson(this);
}
