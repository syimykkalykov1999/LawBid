// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_bulk_filter_preview_dto.g.dart';

@JsonSerializable()
class AdminBulkFilterPreviewDto {
  const AdminBulkFilterPreviewDto({
    required this.matched,
    required this.capped,
    required this.cap,
  });

  factory AdminBulkFilterPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminBulkFilterPreviewDtoFromJson(json);

  /// Rows the action would touch (at most `cap`; no live count).
  final int matched;

  /// More rows match than `cap`; the action touches the first `cap`.
  final bool capped;

  /// The most one call touches for this admin (`admin.bulk_select_cap`); null = no cap (the owner).
  final int? cap;

  Map<String, Object?> toJson() => _$AdminBulkFilterPreviewDtoToJson(this);
}
