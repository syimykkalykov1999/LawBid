// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_post_class_action.dart';

part 'admin_classify_posts_dto.g.dart';

@JsonSerializable()
class AdminClassifyPostsDto {
  const AdminClassifyPostsDto({required this.ids, required this.contentClass});

  factory AdminClassifyPostsDto.fromJson(Map<String, Object?> json) =>
      _$AdminClassifyPostsDtoFromJson(json);

  final List<String> ids;
  final AdminPostClassAction contentClass;

  Map<String, Object?> toJson() => _$AdminClassifyPostsDtoToJson(this);
}
