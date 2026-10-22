// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'media_decision_dto_decision.dart';

part 'media_decision_dto.g.dart';

@JsonSerializable()
class MediaDecisionDto {
  const MediaDecisionDto({required this.decision});

  factory MediaDecisionDto.fromJson(Map<String, Object?> json) =>
      _$MediaDecisionDtoFromJson(json);

  final MediaDecisionDtoDecision decision;

  Map<String, Object?> toJson() => _$MediaDecisionDtoToJson(this);
}
