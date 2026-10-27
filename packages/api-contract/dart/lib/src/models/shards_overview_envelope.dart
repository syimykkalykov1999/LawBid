// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'shards_overview_dto.dart';

part 'shards_overview_envelope.g.dart';

@JsonSerializable()
class ShardsOverviewEnvelope {
  const ShardsOverviewEnvelope({required this.data, this.meta});

  factory ShardsOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$ShardsOverviewEnvelopeFromJson(json);

  final ShardsOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ShardsOverviewEnvelopeToJson(this);
}
