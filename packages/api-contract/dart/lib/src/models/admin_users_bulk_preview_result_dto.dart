// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_users_bulk_preview_result_dto.g.dart';

@JsonSerializable()
class AdminUsersBulkPreviewResultDto {
  const AdminUsersBulkPreviewResultDto({
    required this.matched,
    required this.capped,
    required this.cap,
  });

  factory AdminUsersBulkPreviewResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminUsersBulkPreviewResultDtoFromJson(json);

  /// Users matching the filter, at most `cap` (no live count).
  final int matched;

  /// More users match than `cap`; the action touches the first `cap`.
  final bool capped;

  /// The most one bulk call touches.
  final int cap;

  Map<String, Object?> toJson() => _$AdminUsersBulkPreviewResultDtoToJson(this);
}
