// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_qa_question_detail_dto.dart';
import 'response_meta_dto.dart';

part 'admin_qa_question_detail_envelope.g.dart';

@JsonSerializable()
class AdminQaQuestionDetailEnvelope {
  const AdminQaQuestionDetailEnvelope({required this.data, this.meta});

  factory AdminQaQuestionDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminQaQuestionDetailEnvelopeFromJson(json);

  final AdminQaQuestionDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminQaQuestionDetailEnvelopeToJson(this);
}
