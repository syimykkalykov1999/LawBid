// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_set_plan_price_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_set_plan_price_result_envelope.g.dart';

@JsonSerializable()
class AdminSetPlanPriceResultEnvelope {
  const AdminSetPlanPriceResultEnvelope({required this.data, this.meta});

  factory AdminSetPlanPriceResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminSetPlanPriceResultEnvelopeFromJson(json);

  final AdminSetPlanPriceResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminSetPlanPriceResultEnvelopeToJson(this);
}
