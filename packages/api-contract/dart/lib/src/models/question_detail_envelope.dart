// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'question_detail_dto.dart';
import 'response_meta_dto.dart';

part 'question_detail_envelope.g.dart';

@JsonSerializable()
class QuestionDetailEnvelope {
  const QuestionDetailEnvelope({required this.data, this.meta});

  factory QuestionDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$QuestionDetailEnvelopeFromJson(json);

  final QuestionDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QuestionDetailEnvelopeToJson(this);
}
