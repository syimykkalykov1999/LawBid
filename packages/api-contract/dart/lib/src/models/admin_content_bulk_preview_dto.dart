// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_bulk_content_type.dart';
import 'admin_content_bulk_filter_dto.dart';

part 'admin_content_bulk_preview_dto.g.dart';

@JsonSerializable()
class AdminContentBulkPreviewDto {
  const AdminContentBulkPreviewDto({required this.type, required this.filter});

  factory AdminContentBulkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminContentBulkPreviewDtoFromJson(json);

  final AdminBulkContentType type;
  final AdminContentBulkFilterDto filter;

  Map<String, Object?> toJson() => _$AdminContentBulkPreviewDtoToJson(this);
}
