// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_stats_dto.dart';
import 'response_meta_dto.dart';

part 'attorney_stats_envelope.g.dart';

@JsonSerializable()
class AttorneyStatsEnvelope {
  const AttorneyStatsEnvelope({required this.data, this.meta});

  factory AttorneyStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AttorneyStatsEnvelopeFromJson(json);

  final AttorneyStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AttorneyStatsEnvelopeToJson(this);
}
