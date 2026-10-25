// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'aws_budgets_dto.dart';
import 'response_meta_dto.dart';

part 'aws_budgets_envelope.g.dart';

@JsonSerializable()
class AwsBudgetsEnvelope {
  const AwsBudgetsEnvelope({required this.data, this.meta});

  factory AwsBudgetsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AwsBudgetsEnvelopeFromJson(json);

  final AwsBudgetsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AwsBudgetsEnvelopeToJson(this);
}
