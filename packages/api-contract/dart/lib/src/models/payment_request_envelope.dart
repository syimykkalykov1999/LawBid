// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_request_dto.dart';
import 'response_meta_dto.dart';

part 'payment_request_envelope.g.dart';

@JsonSerializable()
class PaymentRequestEnvelope {
  const PaymentRequestEnvelope({required this.data, this.meta});

  factory PaymentRequestEnvelope.fromJson(Map<String, Object?> json) =>
      _$PaymentRequestEnvelopeFromJson(json);

  final PaymentRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PaymentRequestEnvelopeToJson(this);
}
