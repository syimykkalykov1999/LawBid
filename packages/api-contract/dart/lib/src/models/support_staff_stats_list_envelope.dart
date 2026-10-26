// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_staff_stats_dto.dart';

part 'support_staff_stats_list_envelope.g.dart';

@JsonSerializable()
class SupportStaffStatsListEnvelope {
  const SupportStaffStatsListEnvelope({required this.data, this.meta});

  factory SupportStaffStatsListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportStaffStatsListEnvelopeFromJson(json);

  final List<SupportStaffStatsDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportStaffStatsListEnvelopeToJson(this);
}
