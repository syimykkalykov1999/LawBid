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
  final int likeCount;
  final bool likedByMe;
  final bool isBest;
  final bool isMine;
  final String createdAt;
  final String updatedAt;

  Map<String, Object?> toJson() => _$AnswerDtoToJson(this);
}
