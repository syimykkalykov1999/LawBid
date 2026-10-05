// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'trust_stats_dto.dart';

part 'trust_stats_envelope.g.dart';

@JsonSerializable()
class TrustStatsEnvelope {
  const TrustStatsEnvelope({required this.data, this.meta});

  factory TrustStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$TrustStatsEnvelopeFromJson(json);

  final TrustStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TrustStatsEnvelopeToJson(this);
}
