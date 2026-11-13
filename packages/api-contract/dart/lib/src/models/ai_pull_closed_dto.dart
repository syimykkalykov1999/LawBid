// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ai_pull_closed_dto.g.dart';

@JsonSerializable()
class AiPullClosedDto {
  const AiPullClosedDto({required this.number});

  factory AiPullClosedDto.fromJson(Map<String, Object?> json) =>
      _$AiPullClosedDtoFromJson(json);

  final num number;

  Map<String, Object?> toJson() => _$AiPullClosedDtoToJson(this);
}
