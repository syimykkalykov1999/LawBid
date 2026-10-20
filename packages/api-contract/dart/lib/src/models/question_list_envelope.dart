// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'question_dto.dart';
import 'response_meta_dto.dart';

part 'question_list_envelope.g.dart';

@JsonSerializable()
class QuestionListEnvelope {
  const QuestionListEnvelope({required this.data, this.meta});

  factory QuestionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$QuestionListEnvelopeFromJson(json);

  final List<QuestionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QuestionListEnvelopeToJson(this);
}
