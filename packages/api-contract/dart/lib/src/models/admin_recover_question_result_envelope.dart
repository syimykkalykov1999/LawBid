// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_recover_question_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_recover_question_result_envelope.g.dart';

@JsonSerializable()
class AdminRecoverQuestionResultEnvelope {
  const AdminRecoverQuestionResultEnvelope({required this.data, this.meta});

  factory AdminRecoverQuestionResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminRecoverQuestionResultEnvelopeFromJson(json);

  final AdminRecoverQuestionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminRecoverQuestionResultEnvelopeToJson(this);
}
