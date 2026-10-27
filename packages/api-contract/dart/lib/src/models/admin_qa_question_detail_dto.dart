// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_qa_answer_dto.dart';
import 'admin_qa_person_dto.dart';

part 'admin_qa_question_detail_dto.g.dart';

@JsonSerializable()
class AdminQaQuestionDetailDto {
  const AdminQaQuestionDetailDto({
    required this.id,
    required this.title,
    required this.body,
    required this.status,
    required this.isAnonymous,
    required this.answerCount,
    required this.bestAnswerId,
    required this.stateCode,
    required this.practiceArea,
    required this.author,
    required this.safetyFlags,
    required this.createdAt,
    required this.answers,
  });

  factory AdminQaQuestionDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminQaQuestionDetailDtoFromJson(json);

  final String id;
  final String title;
  final String body;

  /// published | hidden | removed (a deleted one reads removed)
  final String status;
  final bool isAnonymous;
  final num answerCount;
  final String? bestAnswerId;
  final String? stateCode;
  final String? practiceArea;

  /// Shown to the admin even when the author is anonymous to others.
  final AdminQaPersonDto author;

  /// Owner 2026-10-28: private-info kinds found in the text (ssn, address, case_number, party_name ...).
  final List<String> safetyFlags;
  final DateTime createdAt;
  final List<AdminQaAnswerDto> answers;

  Map<String, Object?> toJson() => _$AdminQaQuestionDetailDtoToJson(this);
}
