// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'appeal_decision_result_dto_status.dart';

part 'appeal_decision_result_dto.g.dart';

@JsonSerializable()
class AppealDecisionResultDto {
  const AppealDecisionResultDto({required this.status});

  factory AppealDecisionResultDto.fromJson(Map<String, Object?> json) =>
      _$AppealDecisionResultDtoFromJson(json);

  final AppealDecisionResultDtoStatus status;

  Map<String, Object?> toJson() => _$AppealDecisionResultDtoToJson(this);
}
