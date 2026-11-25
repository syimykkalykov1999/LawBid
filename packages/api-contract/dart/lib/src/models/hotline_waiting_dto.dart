// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_waiting_dto.g.dart';

@JsonSerializable()
class HotlineWaitingDto {
  const HotlineWaitingDto({
    required this.requestId,
    required this.topic,
    required this.state,
    required this.practiceArea,
    required this.language,
    required this.waitingSince,
  });

  factory HotlineWaitingDto.fromJson(Map<String, Object?> json) =>
      _$HotlineWaitingDtoFromJson(json);

  final String requestId;
  final String topic;
  final String state;
  final String practiceArea;

  /// The call language (matched to his line).
  final String language;

  /// ms, «ждёт 1:40» counts from here
  final num waitingSince;

  Map<String, Object?> toJson() => _$HotlineWaitingDtoToJson(this);
}
