// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'session_ended_dto.g.dart';

@JsonSerializable()
class SessionEndedDto {
  const SessionEndedDto({required this.ended});

  factory SessionEndedDto.fromJson(Map<String, Object?> json) =>
      _$SessionEndedDtoFromJson(json);

  /// Always true.
  final bool ended;

  Map<String, Object?> toJson() => _$SessionEndedDtoToJson(this);
}
