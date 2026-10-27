// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_qa_person_dto.dart';

part 'admin_qa_question_dto.g.dart';

@JsonSerializable()
class AdminQaQuestionDto {
  const AdminQaQuestionDto({
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
  });

  factory AdminQaQuestionDto.fromJson(Map<String, Object?> json) =>
      _$AdminQaQuestionDtoFromJson(json);

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

  Map<String, Object?> toJson() => _$AdminQaQuestionDtoToJson(this);
}
