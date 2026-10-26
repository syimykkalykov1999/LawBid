// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'billing_overview_dto.dart';
import 'response_meta_dto.dart';

part 'billing_overview_envelope.g.dart';

@JsonSerializable()
class BillingOverviewEnvelope {
  const BillingOverviewEnvelope({required this.data, this.meta});

  factory BillingOverviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$BillingOverviewEnvelopeFromJson(json);

  final BillingOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BillingOverviewEnvelopeToJson(this);
}
