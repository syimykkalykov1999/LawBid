// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'apply_plan_result_dto.dart';
import 'response_meta_dto.dart';

part 'apply_plan_result_envelope.g.dart';

@JsonSerializable()
class ApplyPlanResultEnvelope {
  const ApplyPlanResultEnvelope({required this.data, this.meta});

  factory ApplyPlanResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ApplyPlanResultEnvelopeFromJson(json);

  final ApplyPlanResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ApplyPlanResultEnvelopeToJson(this);
}
