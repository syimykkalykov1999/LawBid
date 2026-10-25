// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_users_bulk_preview_result_dto.g.dart';

@JsonSerializable()
class AdminUsersBulkPreviewResultDto {
  const AdminUsersBulkPreviewResultDto({
    required this.count,
    required this.cap,
  });

  factory AdminUsersBulkPreviewResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminUsersBulkPreviewResultDtoFromJson(json);

  /// Users matching the filter.
  final int count;

  /// The most one bulk call touches.
  final int cap;

  Map<String, Object?> toJson() => _$AdminUsersBulkPreviewResultDtoToJson(this);
}
