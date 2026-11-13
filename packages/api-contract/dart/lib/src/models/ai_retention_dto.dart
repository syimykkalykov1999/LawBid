// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_retention_dto.g.dart';

@JsonSerializable()
class AiRetentionDto {
  const AiRetentionDto({required this.recordsDays, required this.imagesDays});

  factory AiRetentionDto.fromJson(Map<String, Object?> json) =>
      _$AiRetentionDtoFromJson(json);

  /// AI employee records (finished runs, decided items).
  final num recordsDays;
  final num imagesDays;

  Map<String, Object?> toJson() => _$AiRetentionDtoToJson(this);
}
