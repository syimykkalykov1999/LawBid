// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stop_timer_dto.g.dart';

@JsonSerializable()
class StopTimerDto {
  const StopTimerDto({
    this.note,
  });
  
  factory StopTimerDto.fromJson(Map<String, Object?> json) => _$StopTimerDtoFromJson(json);
  
  final String? note;

  Map<String, Object?> toJson() => _$StopTimerDtoToJson(this);
}
