// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'split_plan_dto.dart';

part 'split_plan_envelope.g.dart';

@JsonSerializable()
class SplitPlanEnvelope {
  const SplitPlanEnvelope({required this.data, this.meta});

  factory SplitPlanEnvelope.fromJson(Map<String, Object?> json) =>
      _$SplitPlanEnvelopeFromJson(json);

  final SplitPlanDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SplitPlanEnvelopeToJson(this);
}
