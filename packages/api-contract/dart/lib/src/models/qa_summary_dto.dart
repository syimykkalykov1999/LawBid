// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qa_summary_dto.g.dart';

@JsonSerializable()
class QaSummaryDto {
  const QaSummaryDto({required this.newCount});

  factory QaSummaryDto.fromJson(Map<String, Object?> json) =>
      _$QaSummaryDtoFromJson(json);

  /// Unanswered questions of the last 24 hours in my practice areas and states (attorney; 0 for others)
  final num newCount;

  Map<String, Object?> toJson() => _$QaSummaryDtoToJson(this);
}
