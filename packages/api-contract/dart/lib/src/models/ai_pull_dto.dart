// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_pull_dto_checks.dart';

part 'ai_pull_dto.g.dart';

@JsonSerializable()
class AiPullDto {
  const AiPullDto({
    required this.number,
    required this.title,
    required this.url,
    required this.summary,
    required this.headSha,
    required this.branch,
    required this.createdAt,
    required this.checks,
    required this.costUsd,
  });

  factory AiPullDto.fromJson(Map<String, Object?> json) =>
      _$AiPullDtoFromJson(json);

  final num number;
  final String title;
  final String url;

  /// What / why: the PR body, cut.
  final String summary;

  /// The head commit the owner approves.
  final String headSha;
  final String branch;
  final DateTime createdAt;
  final AiPullDtoChecks checks;
  final num? costUsd;

  Map<String, Object?> toJson() => _$AiPullDtoToJson(this);
}
