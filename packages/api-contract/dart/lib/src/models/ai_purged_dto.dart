// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_purged_dto.g.dart';

@JsonSerializable()
class AiPurgedDto {
  const AiPurgedDto({
    required this.items,
    required this.runs,
    required this.images,
    required this.closedTasks,
    required this.unattached,
  });

  factory AiPurgedDto.fromJson(Map<String, Object?> json) =>
      _$AiPurgedDtoFromJson(json);

  final num items;
  final num runs;
  final num images;
  final num closedTasks;
  final num unattached;

  Map<String, Object?> toJson() => _$AiPurgedDtoToJson(this);
}
