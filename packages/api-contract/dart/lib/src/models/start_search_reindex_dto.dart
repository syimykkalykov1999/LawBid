// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'start_search_reindex_dto_source.dart';

part 'start_search_reindex_dto.g.dart';

@JsonSerializable()
class StartSearchReindexDto {
  const StartSearchReindexDto({this.source});

  factory StartSearchReindexDto.fromJson(Map<String, Object?> json) =>
      _$StartSearchReindexDtoFromJson(json);

  /// postgres (default): rebuild documents from the database. engine: copy inside the engine with the native _reindex task (documents keep their shape).
  final StartSearchReindexDtoSource? source;

  Map<String, Object?> toJson() => _$StartSearchReindexDtoToJson(this);
}
