// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'running_timer_dto.g.dart';

@JsonSerializable()
class RunningTimerDto {
  const RunningTimerDto({
    required this.entryId,
    required this.caseId,
    required this.caseTitle,
    required this.startedAt,
  });

  factory RunningTimerDto.fromJson(Map<String, Object?> json) =>
      _$RunningTimerDtoFromJson(json);

  final String entryId;
  final String caseId;
  final String caseTitle;
  final DateTime startedAt;

  Map<String, Object?> toJson() => _$RunningTimerDtoToJson(this);
}
