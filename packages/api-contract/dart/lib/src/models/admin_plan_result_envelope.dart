// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_plan_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_plan_result_envelope.g.dart';

@JsonSerializable()
class AdminPlanResultEnvelope {
  const AdminPlanResultEnvelope({required this.data, this.meta});

  factory AdminPlanResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPlanResultEnvelopeFromJson(json);

  final AdminPlanResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPlanResultEnvelopeToJson(this);
}
