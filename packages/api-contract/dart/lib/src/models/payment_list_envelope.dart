// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_dto.dart';
import 'response_meta_dto.dart';

part 'payment_list_envelope.g.dart';

@JsonSerializable()
class PaymentListEnvelope {
  const PaymentListEnvelope({required this.data, this.meta});

  factory PaymentListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PaymentListEnvelopeFromJson(json);

  final List<PaymentDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PaymentListEnvelopeToJson(this);
}
