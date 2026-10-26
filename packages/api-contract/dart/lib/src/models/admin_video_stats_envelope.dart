// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_video_stats_dto.dart';
import 'response_meta_dto.dart';

part 'admin_video_stats_envelope.g.dart';

@JsonSerializable()
class AdminVideoStatsEnvelope {
  const AdminVideoStatsEnvelope({required this.data, this.meta});

  factory AdminVideoStatsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminVideoStatsEnvelopeFromJson(json);

  final AdminVideoStatsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminVideoStatsEnvelopeToJson(this);
}
