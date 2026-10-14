// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'new_entitlement_result_dto.dart';
import 'response_meta_dto.dart';

part 'new_entitlement_result_envelope.g.dart';

@JsonSerializable()
class NewEntitlementResultEnvelope {
  const NewEntitlementResultEnvelope({required this.data, this.meta});

  factory NewEntitlementResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$NewEntitlementResultEnvelopeFromJson(json);

  final NewEntitlementResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$NewEntitlementResultEnvelopeToJson(this);
}
