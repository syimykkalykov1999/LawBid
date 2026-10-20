// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'appeal_decision_result_dto.dart';
import 'response_meta_dto.dart';

part 'appeal_decision_result_envelope.g.dart';

@JsonSerializable()
class AppealDecisionResultEnvelope {
  const AppealDecisionResultEnvelope({required this.data, this.meta});

  factory AppealDecisionResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AppealDecisionResultEnvelopeFromJson(json);

  final AppealDecisionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AppealDecisionResultEnvelopeToJson(this);
}
