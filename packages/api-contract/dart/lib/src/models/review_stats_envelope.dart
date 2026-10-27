// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_stats_dto.dart';

part 'review_stats_envelope.g.dart';

@JsonSerializable()
class ReviewStatsEnvelope {
  const ReviewStatsEnvelope({required this.data, this.meta});

  factory ReviewStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewStatsEnvelopeFromJson(json);

  final ReviewStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewStatsEnvelopeToJson(this);
}
