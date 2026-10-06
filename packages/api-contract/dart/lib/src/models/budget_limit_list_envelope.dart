// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_limit_dto.dart';
import 'response_meta_dto.dart';

part 'budget_limit_list_envelope.g.dart';

@JsonSerializable()
class BudgetLimitListEnvelope {
  const BudgetLimitListEnvelope({required this.data, this.meta});

  factory BudgetLimitListEnvelope.fromJson(Map<String, Object?> json) =>
      _$BudgetLimitListEnvelopeFromJson(json);

  final List<BudgetLimitDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BudgetLimitListEnvelopeToJson(this);
}
