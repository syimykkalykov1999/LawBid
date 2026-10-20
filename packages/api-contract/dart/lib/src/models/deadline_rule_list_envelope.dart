// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deadline_rule_dto.dart';
import 'response_meta_dto.dart';

part 'deadline_rule_list_envelope.g.dart';

@JsonSerializable()
class DeadlineRuleListEnvelope {
  const DeadlineRuleListEnvelope({required this.data, this.meta});

  factory DeadlineRuleListEnvelope.fromJson(Map<String, Object?> json) =>
      _$DeadlineRuleListEnvelopeFromJson(json);

  final List<DeadlineRuleDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DeadlineRuleListEnvelopeToJson(this);
}
