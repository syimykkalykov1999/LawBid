// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_flag_decision_result_dto.dart';

part 'staff_flag_decision_result_envelope.g.dart';

@JsonSerializable()
class StaffFlagDecisionResultEnvelope {
  const StaffFlagDecisionResultEnvelope({required this.data, this.meta});

  factory StaffFlagDecisionResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffFlagDecisionResultEnvelopeFromJson(json);

  final StaffFlagDecisionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$StaffFlagDecisionResultEnvelopeToJson(this);
}
