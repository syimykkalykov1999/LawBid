// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_stats_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_stats_envelope.g.dart';

@JsonSerializable()
class HotlineStatsEnvelope {
  const HotlineStatsEnvelope({required this.data, this.meta});

  factory HotlineStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineStatsEnvelopeFromJson(json);

  final HotlineStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineStatsEnvelopeToJson(this);
}
