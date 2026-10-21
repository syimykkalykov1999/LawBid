// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ask_question_dto.g.dart';

@JsonSerializable()
class AskQuestionDto {
  const AskQuestionDto({
    required this.title,
    required this.body,
    this.anonymous = false,
    this.practiceAreaId,
    this.stateCode,
  });

  factory AskQuestionDto.fromJson(Map<String, Object?> json) =>
      _$AskQuestionDtoFromJson(json);

  final String title;
  final String body;

  /// A practice area or its category
  final String? practiceAreaId;
  final String? stateCode;

  /// Others see «Anonymous».
  final bool anonymous;

  Map<String, Object?> toJson() => _$AskQuestionDtoToJson(this);
}
