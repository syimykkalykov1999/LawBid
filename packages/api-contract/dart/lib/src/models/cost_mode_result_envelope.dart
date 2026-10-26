// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_mode_result_dto.dart';
import 'response_meta_dto.dart';

part 'cost_mode_result_envelope.g.dart';

@JsonSerializable()
class CostModeResultEnvelope {
  const CostModeResultEnvelope({required this.data, this.meta});

  factory CostModeResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$CostModeResultEnvelopeFromJson(json);

  final CostModeResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CostModeResultEnvelopeToJson(this);
}
