// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qa_stats_dto.g.dart';

@JsonSerializable()
class QaStatsDto {
  const QaStatsDto({required this.answers, required this.best});

  factory QaStatsDto.fromJson(Map<String, Object?> json) =>
      _$QaStatsDtoFromJson(json);

  /// Published answers to public questions.
  final num answers;

  /// Of them chosen as the best answer.
  final num best;

  Map<String, Object?> toJson() => _$QaStatsDtoToJson(this);
}
