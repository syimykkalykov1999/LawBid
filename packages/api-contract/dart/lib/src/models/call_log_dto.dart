// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_outcome.dart';

part 'call_log_dto.g.dart';

@JsonSerializable()
class CallLogDto {
  const CallLogDto({required this.outcome, required this.durationSec});

  factory CallLogDto.fromJson(Map<String, Object?> json) =>
      _$CallLogDtoFromJson(json);

  final CallOutcome outcome;

  /// Talk time; 0 if unanswered.
  final int durationSec;

  Map<String, Object?> toJson() => _$CallLogDtoToJson(this);
}
