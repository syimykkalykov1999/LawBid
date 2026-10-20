// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_qa_person_dto.dart';

part 'admin_qa_answer_dto.g.dart';

@JsonSerializable()
class AdminQaAnswerDto {
  const AdminQaAnswerDto({
    required this.id,
    required this.body,
    required this.status,
    required this.isBest,
    required this.likeCount,
    required this.attorney,
    required this.createdAt,
  });

  factory AdminQaAnswerDto.fromJson(Map<String, Object?> json) =>
      _$AdminQaAnswerDtoFromJson(json);

  final String id;
  final String body;

  /// published | hidden | removed
  final String status;
  final bool isBest;
  final num likeCount;
  final AdminQaPersonDto attorney;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminQaAnswerDtoToJson(this);
}
