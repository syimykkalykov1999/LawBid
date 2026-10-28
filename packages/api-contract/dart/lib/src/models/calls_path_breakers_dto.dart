// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calls_path_breakers_dto_sfu.dart';
import 'calls_path_breakers_dto_turn.dart';

part 'calls_path_breakers_dto.g.dart';

@JsonSerializable()
class CallsPathBreakersDto {
  const CallsPathBreakersDto({required this.turn, required this.sfu});

  factory CallsPathBreakersDto.fromJson(Map<String, Object?> json) =>
      _$CallsPathBreakersDtoFromJson(json);

  final CallsPathBreakersDtoTurn turn;
  final CallsPathBreakersDtoSfu sfu;

  Map<String, Object?> toJson() => _$CallsPathBreakersDtoToJson(this);
}
