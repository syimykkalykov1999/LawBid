// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_quote_dto.dart';
import 'response_meta_dto.dart';

part 'payment_quote_envelope.g.dart';

@JsonSerializable()
class PaymentQuoteEnvelope {
  const PaymentQuoteEnvelope({required this.data, this.meta});

  factory PaymentQuoteEnvelope.fromJson(Map<String, Object?> json) =>
      _$PaymentQuoteEnvelopeFromJson(json);

  final PaymentQuoteDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PaymentQuoteEnvelopeToJson(this);
}
