// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_pull_merged_dto.g.dart';

@JsonSerializable()
class AiPullMergedDto {
  const AiPullMergedDto({required this.number, required this.mergedSha});

  factory AiPullMergedDto.fromJson(Map<String, Object?> json) =>
      _$AiPullMergedDtoFromJson(json);

  final num number;
  final String mergedSha;

  Map<String, Object?> toJson() => _$AiPullMergedDtoToJson(this);
}
