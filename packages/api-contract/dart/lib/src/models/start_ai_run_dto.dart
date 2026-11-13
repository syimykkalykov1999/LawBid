// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_ai_run_dto.g.dart';

@JsonSerializable()
class StartAiRunDto {
  const StartAiRunDto({this.limit});

  factory StartAiRunDto.fromJson(Map<String, Object?> json) =>
      _$StartAiRunDtoFromJson(json);

  /// Only the first N open items (empty = all of them).
  final num? limit;

  Map<String, Object?> toJson() => _$StartAiRunDtoToJson(this);
}
