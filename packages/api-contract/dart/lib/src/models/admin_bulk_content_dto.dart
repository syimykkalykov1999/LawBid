// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_bulk_content_action.dart';
import 'admin_bulk_content_type.dart';

part 'admin_bulk_content_dto.g.dart';

@JsonSerializable()
class AdminBulkContentDto {
  const AdminBulkContentDto({
    required this.ids,
    required this.action,
    required this.type,
    this.reason = '',
  });

  factory AdminBulkContentDto.fromJson(Map<String, Object?> json) =>
      _$AdminBulkContentDtoFromJson(json);

  final String reason;
  final List<String> ids;

  /// remove: posts and comments (the author is told why); hide: any type (the author is told why); restore: back to visible.
  final AdminBulkContentAction action;
  final AdminBulkContentType type;

  Map<String, Object?> toJson() => _$AdminBulkContentDtoToJson(this);
}
