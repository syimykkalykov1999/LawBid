// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_comment_dto.dart';
import 'response_meta_dto.dart';

part 'case_comment_envelope.g.dart';

@JsonSerializable()
class CaseCommentEnvelope {
  const CaseCommentEnvelope({required this.data, this.meta});

  factory CaseCommentEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseCommentEnvelopeFromJson(json);

  final CaseCommentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseCommentEnvelopeToJson(this);
}
