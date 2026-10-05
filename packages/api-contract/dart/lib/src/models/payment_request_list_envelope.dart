// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_request_dto.dart';
import 'response_meta_dto.dart';

part 'payment_request_list_envelope.g.dart';

@JsonSerializable()
class PaymentRequestListEnvelope {
  const PaymentRequestListEnvelope({required this.data, this.meta});

  factory PaymentRequestListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PaymentRequestListEnvelopeFromJson(json);

  final List<PaymentRequestDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PaymentRequestListEnvelopeToJson(this);
}
