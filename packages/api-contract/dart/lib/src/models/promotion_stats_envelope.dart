// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_stats_dto.dart';
import 'response_meta_dto.dart';

part 'promotion_stats_envelope.g.dart';

@JsonSerializable()
class PromotionStatsEnvelope {
  const PromotionStatsEnvelope({required this.data, this.meta});

  factory PromotionStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromotionStatsEnvelopeFromJson(json);

  final PromotionStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromotionStatsEnvelopeToJson(this);
}
