// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'approve_bulk_ai_items_dto.g.dart';

@JsonSerializable()
class ApproveBulkAiItemsDto {
  const ApproveBulkAiItemsDto({this.runId});

  factory ApproveBulkAiItemsDto.fromJson(Map<String, Object?> json) =>
      _$ApproveBulkAiItemsDtoFromJson(json);

  /// Only this run.
  final String? runId;

  Map<String, Object?> toJson() => _$ApproveBulkAiItemsDtoToJson(this);
}
