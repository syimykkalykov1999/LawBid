// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_videos_filter_dto.dart';

part 'admin_videos_bulk_preview_dto.g.dart';

@JsonSerializable()
class AdminVideosBulkPreviewDto {
  const AdminVideosBulkPreviewDto({required this.filter});

  factory AdminVideosBulkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminVideosBulkPreviewDtoFromJson(json);

  final AdminVideosFilterDto filter;

  Map<String, Object?> toJson() => _$AdminVideosBulkPreviewDtoToJson(this);
}
