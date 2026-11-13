// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_item_dto.dart';

part 'ai_worker_items_dto.g.dart';

@JsonSerializable()
class AiWorkerItemsDto {
  const AiWorkerItemsDto({required this.items, required this.nextCursor});

  factory AiWorkerItemsDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerItemsDtoFromJson(json);

  final List<AiWorkerItemDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$AiWorkerItemsDtoToJson(this);
}
