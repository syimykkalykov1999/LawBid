// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_decision_stats_dto.dart';

part 'staff_decision_stats_list_envelope.g.dart';

@JsonSerializable()
class StaffDecisionStatsListEnvelope {
  const StaffDecisionStatsListEnvelope({required this.data, this.meta});

  factory StaffDecisionStatsListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffDecisionStatsListEnvelopeFromJson(json);

  final List<StaffDecisionStatsDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffDecisionStatsListEnvelopeToJson(this);
}
