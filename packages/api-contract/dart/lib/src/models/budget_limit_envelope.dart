// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_limit_dto.dart';
import 'response_meta_dto.dart';

part 'budget_limit_envelope.g.dart';

@JsonSerializable()
class BudgetLimitEnvelope {
  const BudgetLimitEnvelope({required this.data, this.meta});

  factory BudgetLimitEnvelope.fromJson(Map<String, Object?> json) =>
      _$BudgetLimitEnvelopeFromJson(json);

  final BudgetLimitDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BudgetLimitEnvelopeToJson(this);
}
