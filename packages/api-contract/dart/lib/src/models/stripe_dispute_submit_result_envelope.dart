// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stripe_dispute_submit_result_dto.dart';

part 'stripe_dispute_submit_result_envelope.g.dart';

@JsonSerializable()
class StripeDisputeSubmitResultEnvelope {
  const StripeDisputeSubmitResultEnvelope({required this.data, this.meta});

  factory StripeDisputeSubmitResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$StripeDisputeSubmitResultEnvelopeFromJson(json);

  final StripeDisputeSubmitResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$StripeDisputeSubmitResultEnvelopeToJson(this);
}
