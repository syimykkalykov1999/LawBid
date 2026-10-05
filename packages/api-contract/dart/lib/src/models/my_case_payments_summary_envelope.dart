// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_case_payments_summary_dto.dart';
import 'response_meta_dto.dart';

part 'my_case_payments_summary_envelope.g.dart';

@JsonSerializable()
class MyCasePaymentsSummaryEnvelope {
  const MyCasePaymentsSummaryEnvelope({required this.data, this.meta});

  factory MyCasePaymentsSummaryEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyCasePaymentsSummaryEnvelopeFromJson(json);

  final MyCasePaymentsSummaryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyCasePaymentsSummaryEnvelopeToJson(this);
}
