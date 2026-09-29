// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_deleted_dto.g.dart';

@JsonSerializable()
class PostDeletedDto {
  const PostDeletedDto({this.deleted = true});

  factory PostDeletedDto.fromJson(Map<String, Object?> json) =>
      _$PostDeletedDtoFromJson(json);

  final bool deleted;

  Map<String, Object?> toJson() => _$PostDeletedDtoToJson(this);
}
