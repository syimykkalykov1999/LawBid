// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_run_dto_kind.dart';

part 'ai_run_dto.g.dart';

@JsonSerializable()
class AiRunDto {
  const AiRunDto({
    required this.at,
    required this.kind,
    required this.issueNumber,
    required this.runUrl,
    required this.costUsd,
    required this.conclusion,
    required this.prUrl,
  });

  factory AiRunDto.fromJson(Map<String, Object?> json) =>
      _$AiRunDtoFromJson(json);

  final DateTime at;
  final AiRunDtoKind kind;
  final num? issueNumber;
  final String runUrl;
  final num costUsd;
  final String conclusion;
  final String? prUrl;

  Map<String, Object?> toJson() => _$AiRunDtoToJson(this);
}
