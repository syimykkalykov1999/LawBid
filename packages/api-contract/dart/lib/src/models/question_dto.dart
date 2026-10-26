// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qa_person_dto.dart';
import 'qa_practice_area_dto.dart';
import 'qa_state_dto.dart';

part 'question_dto.g.dart';

@JsonSerializable()
class QuestionDto {
  const QuestionDto({
    required this.id,
    required this.title,
    required this.body,
    required this.isAnonymous,
    required this.isMine,
    required this.answerCount,
    required this.closed,
    required this.answersEnough,
    required this.canAnswer,
    required this.createdAt,
    this.practiceArea,
    this.state,
    this.author,
    this.bestAnswerId,
    this.myAnswerId,
  });

  factory QuestionDto.fromJson(Map<String, Object?> json) =>
      _$QuestionDtoFromJson(json);

  final String id;
  final String title;
  final String body;
  final QaPracticeAreaDto? practiceArea;
  final QaStateDto? state;
  final bool isAnonymous;

  /// Null when the question is anonymous (the author sees themselves).
  final QaPersonDto? author;
  final bool isMine;
  final int answerCount;

  /// Closed by the author or after 30 days.
  final bool closed;

  /// The question has the most answers (10).
  final bool answersEnough;
  final String? bestAnswerId;
  final String? myAnswerId;

  /// The viewer is a verified attorney who may answer now.
  final bool canAnswer;
  final String createdAt;

  Map<String, Object?> toJson() => _$QuestionDtoToJson(this);
}
