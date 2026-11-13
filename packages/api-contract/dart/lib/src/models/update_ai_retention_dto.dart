// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_retention_what.dart';

part 'update_ai_retention_dto.g.dart';

@JsonSerializable()
class UpdateAiRetentionDto {
  const UpdateAiRetentionDto({required this.days, required this.what});

  factory UpdateAiRetentionDto.fromJson(Map<String, Object?> json) =>
      _$UpdateAiRetentionDtoFromJson(json);

  final num days;
  final AiRetentionWhat what;

  Map<String, Object?> toJson() => _$UpdateAiRetentionDtoToJson(this);
}
