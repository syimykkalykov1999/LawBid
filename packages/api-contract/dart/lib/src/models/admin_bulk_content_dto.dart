// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_bulk_content_action.dart';
import 'admin_bulk_content_type.dart';
import 'admin_content_bulk_filter_dto.dart';

part 'admin_bulk_content_dto.g.dart';

@JsonSerializable()
class AdminBulkContentDto {
  const AdminBulkContentDto({
    required this.action,
    required this.type,
    this.ids,
    this.filter,
    this.reason = '',
  });

  factory AdminBulkContentDto.fromJson(Map<String, Object?> json) =>
      _$AdminBulkContentDtoFromJson(json);

  final String reason;

  /// Exactly one of `ids` or `filter`. Staff: at most 500; the owner: any number (processed in chunks).
  final List<String>? ids;

  /// Row 179 B6: «select all by filter» — the list filter of `type`; the server resolves the ids (staff: at most `admin.bulk_select_cap`) and audits the filter.
  final AdminContentBulkFilterDto? filter;

  /// remove: posts and comments (the author is told why); hide: any type (the author is told why); restore: back to visible.
  final AdminBulkContentAction action;
  final AdminBulkContentType type;

  Map<String, Object?> toJson() => _$AdminBulkContentDtoToJson(this);
}
