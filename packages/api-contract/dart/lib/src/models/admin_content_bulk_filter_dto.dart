// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_content_bulk_filter_dto_media.dart';
import 'admin_post_kind.dart';
import 'admin_review_status.dart';
import 'post_content_class.dart';

part 'admin_content_bulk_filter_dto.g.dart';

@JsonSerializable()
class AdminContentBulkFilterDto {
  const AdminContentBulkFilterDto({
    this.q,
    this.authorId,
    this.from,
    this.to,
    this.kind,
    this.media,
    this.contentClass,
    this.status,
  });

  factory AdminContentBulkFilterDto.fromJson(Map<String, Object?> json) =>
      _$AdminContentBulkFilterDtoFromJson(json);

  /// Search text.
  final String? q;

  /// Only this author.
  final String? authorId;

  /// Created at or after (inclusive).
  final DateTime? from;

  /// Created before (exclusive).
  final DateTime? to;
  final AdminPostKind? kind;
  final AdminContentBulkFilterDtoMedia? media;
  final PostContentClass? contentClass;
  final AdminReviewStatus? status;

  Map<String, Object?> toJson() => _$AdminContentBulkFilterDtoToJson(this);
}
