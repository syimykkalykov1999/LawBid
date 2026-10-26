// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'qa_person_dto.dart';

part 'answer_dto.g.dart';

@JsonSerializable()
class AnswerDto {
  const AnswerDto({
    required this.id,
    required this.questionId,
    required this.attorney,
    required this.body,
    required this.verifiedBadge,
    required this.likeCount,
    required this.likedByMe,
    required this.isBest,
    required this.isMine,
    required this.createdAt,
    required this.updatedAt,
  });

  factory AnswerDto.fromJson(Map<String, Object?> json) =>
      _$AnswerDtoFromJson(json);

  final String id;
  final String questionId;
  final QaPersonDto attorney;
  final String body;

  /// Owner 2026-10-28: the server decides the «verified attorney answer» badge — the answerer is verified now and holds a verified licence in the question’s state.
  final bool verifiedBadge;
  final int likeCount;
  final bool likedByMe;
  final bool isBest;
  final bool isMine;
  final String createdAt;
  final String updatedAt;

  Map<String, Object?> toJson() => _$AnswerDtoToJson(this);
}
