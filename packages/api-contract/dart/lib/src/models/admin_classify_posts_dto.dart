// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_content_bulk_filter_dto.dart';
import 'admin_post_class_action.dart';

part 'admin_classify_posts_dto.g.dart';

@JsonSerializable()
class AdminClassifyPostsDto {
  const AdminClassifyPostsDto({
    required this.contentClass,
    this.ids,
    this.filter,
  });

  factory AdminClassifyPostsDto.fromJson(Map<String, Object?> json) =>
      _$AdminClassifyPostsDtoFromJson(json);

  /// Exactly one of `ids` or `filter`. Staff: at most 200; the owner: any number (processed in chunks).
  final List<String>? ids;

  /// Row 179 B6: «select all by filter» — the posts list filter; the server resolves the ids (staff: at most `admin.bulk_select_cap`).
  final AdminContentBulkFilterDto? filter;
  final AdminPostClassAction contentClass;

  Map<String, Object?> toJson() => _$AdminClassifyPostsDtoToJson(this);
}
