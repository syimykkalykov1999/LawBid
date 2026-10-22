// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'response_meta_dto.g.dart';

@JsonSerializable()
class ResponseMetaDto {
  const ResponseMetaDto({this.nextCursor, this.deletedIds, this.syncedAt});

  factory ResponseMetaDto.fromJson(Map<String, Object?> json) =>
      _$ResponseMetaDtoFromJson(json);

  /// Opaque cursor for the next page; null on the last page.
  final String? nextCursor;

  /// Owner 2026-10-22 (delta sync): with ?updatedSince — ids of rows that left the list (deleted, hidden, no longer mine).
  final List<String>? deletedIds;

  /// Owner 2026-10-22 (delta sync): with ?updatedSince — the newest updated_at of this answer; pass it back as updatedSince next time.
  final DateTime? syncedAt;

  Map<String, Object?> toJson() => _$ResponseMetaDtoToJson(this);
}
