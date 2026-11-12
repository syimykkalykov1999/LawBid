// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_purge_mode.dart';
import 'ai_purge_scope.dart';

part 'purge_ai_retention_dto.g.dart';

@JsonSerializable()
class PurgeAiRetentionDto {
  const PurgeAiRetentionDto({required this.mode, required this.scope});

  factory PurgeAiRetentionDto.fromJson(Map<String, Object?> json) =>
      _$PurgeAiRetentionDtoFromJson(json);

  /// older = past the chosen days; all = every finished record and closed image now.
  final AiPurgeMode mode;

  /// worker = «ИИ-сотрудник» records and images; technician = «ИИ-техник» images.
  final AiPurgeScope scope;

  Map<String, Object?> toJson() => _$PurgeAiRetentionDtoToJson(this);
}
