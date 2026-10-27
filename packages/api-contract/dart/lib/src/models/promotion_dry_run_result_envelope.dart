// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_dry_run_result_dto.dart';
import 'response_meta_dto.dart';

part 'promotion_dry_run_result_envelope.g.dart';

@JsonSerializable()
class PromotionDryRunResultEnvelope {
  const PromotionDryRunResultEnvelope({required this.data, this.meta});

  factory PromotionDryRunResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromotionDryRunResultEnvelopeFromJson(json);

  final PromotionDryRunResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromotionDryRunResultEnvelopeToJson(this);
}
