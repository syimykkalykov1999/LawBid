// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_plan_me_dto.dart';
import 'response_meta_dto.dart';

part 'client_plan_me_envelope.g.dart';

@JsonSerializable()
class ClientPlanMeEnvelope {
  const ClientPlanMeEnvelope({required this.data, this.meta});

  factory ClientPlanMeEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientPlanMeEnvelopeFromJson(json);

  final ClientPlanMeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientPlanMeEnvelopeToJson(this);
}
