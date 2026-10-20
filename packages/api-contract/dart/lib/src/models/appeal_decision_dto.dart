// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'appeal_decision_dto.g.dart';

@JsonSerializable()
class AppealDecisionDto {
  const AppealDecisionDto({required this.accept, required this.note});

  factory AppealDecisionDto.fromJson(Map<String, Object?> json) =>
      _$AppealDecisionDtoFromJson(json);

  /// true = restore the content; false = keep the decision.
  final bool accept;

  /// Shown to the author.
  final String note;

  Map<String, Object?> toJson() => _$AppealDecisionDtoToJson(this);
}
