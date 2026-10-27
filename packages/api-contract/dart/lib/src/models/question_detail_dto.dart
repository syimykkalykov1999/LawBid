// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'answer_dto.dart';
import 'qa_person_dto.dart';
import 'qa_practice_area_dto.dart';
import 'qa_state_dto.dart';

part 'question_detail_dto.g.dart';

@JsonSerializable()
class QuestionDetailDto {
  const QuestionDetailDto({
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
    required this.answers,
    this.practiceArea,
    this.state,
    this.author,
    this.bestAnswerId,
    this.myAnswerId,
    this.privacyWarnings,
  });

  factory QuestionDetailDto.fromJson(Map<String, Object?> json) =>
      _$QuestionDetailDtoFromJson(json);

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

  /// Owner 2026-10-28: only in the answer to POST /questions — kinds of private information found in the text (ssn, address, case_number, party_name ...). With qa.pii_mode=redact they were replaced with a mask.
  final List<String>? privacyWarnings;
  final String createdAt;
  final List<AnswerDto> answers;

  Map<String, Object?> toJson() => _$QuestionDetailDtoToJson(this);
}
