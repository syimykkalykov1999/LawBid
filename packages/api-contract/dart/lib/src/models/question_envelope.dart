// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'question_dto.dart';
import 'response_meta_dto.dart';

part 'question_envelope.g.dart';

@JsonSerializable()
class QuestionEnvelope {
  const QuestionEnvelope({
    required this.data,
    this.meta,
  });
  
  factory QuestionEnvelope.fromJson(Map<String, Object?> json) => _$QuestionEnvelopeFromJson(json);
  
  final QuestionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QuestionEnvelopeToJson(this);
}
