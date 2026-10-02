// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_promotion_stats_dto.dart';
import 'response_meta_dto.dart';

part 'admin_promotion_stats_envelope.g.dart';

@JsonSerializable()
class AdminPromotionStatsEnvelope {
  const AdminPromotionStatsEnvelope({required this.data, this.meta});

  factory AdminPromotionStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPromotionStatsEnvelopeFromJson(json);

  final AdminPromotionStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPromotionStatsEnvelopeToJson(this);
}
