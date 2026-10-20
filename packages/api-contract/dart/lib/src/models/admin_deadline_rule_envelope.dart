// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_deadline_rule_dto.dart';
import 'response_meta_dto.dart';

part 'admin_deadline_rule_envelope.g.dart';

@JsonSerializable()
class AdminDeadlineRuleEnvelope {
  const AdminDeadlineRuleEnvelope({required this.data, this.meta});

  factory AdminDeadlineRuleEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminDeadlineRuleEnvelopeFromJson(json);

  final AdminDeadlineRuleDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminDeadlineRuleEnvelopeToJson(this);
}
