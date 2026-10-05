// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_plan_checkout_dto.dart';
import 'response_meta_dto.dart';

part 'client_plan_checkout_envelope.g.dart';

@JsonSerializable()
class ClientPlanCheckoutEnvelope {
  const ClientPlanCheckoutEnvelope({required this.data, this.meta});

  factory ClientPlanCheckoutEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientPlanCheckoutEnvelopeFromJson(json);

  final ClientPlanCheckoutDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientPlanCheckoutEnvelopeToJson(this);
}
