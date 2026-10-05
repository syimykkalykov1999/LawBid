// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_recompute_all_result_dto.dart';
import 'response_meta_dto.dart';

part 'fraud_recompute_all_result_envelope.g.dart';

@JsonSerializable()
class FraudRecomputeAllResultEnvelope {
  const FraudRecomputeAllResultEnvelope({required this.data, this.meta});

  factory FraudRecomputeAllResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$FraudRecomputeAllResultEnvelopeFromJson(json);

  final FraudRecomputeAllResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$FraudRecomputeAllResultEnvelopeToJson(this);
}
