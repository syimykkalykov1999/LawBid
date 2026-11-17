// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_videos_filter_dto.dart';

part 'admin_videos_bulk_dto.g.dart';

@JsonSerializable()
class AdminVideosBulkDto {
  const AdminVideosBulkDto({this.ids, this.filter, this.reason = ''});

  factory AdminVideosBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminVideosBulkDtoFromJson(json);

  final String reason;

  /// Exactly one of `ids` or `filter`. Staff: at most 500; the owner: any number (processed in chunks).
  final List<String>? ids;

  /// Row 179 B6: «select all by filter» — the list filter; the server resolves the ids (staff: at most `admin.bulk_select_cap`) and audits the filter.
  final AdminVideosFilterDto? filter;

  Map<String, Object?> toJson() => _$AdminVideosBulkDtoToJson(this);
}
