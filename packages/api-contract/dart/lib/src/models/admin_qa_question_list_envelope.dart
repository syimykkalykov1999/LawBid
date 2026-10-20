// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_qa_question_dto.dart';
import 'response_meta_dto.dart';

part 'admin_qa_question_list_envelope.g.dart';

@JsonSerializable()
class AdminQaQuestionListEnvelope {
  const AdminQaQuestionListEnvelope({required this.data, this.meta});

  factory AdminQaQuestionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminQaQuestionListEnvelopeFromJson(json);

  final List<AdminQaQuestionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminQaQuestionListEnvelopeToJson(this);
}
