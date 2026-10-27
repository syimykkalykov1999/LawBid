// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'record_invoice_payment_dto.g.dart';

@JsonSerializable()
class RecordInvoicePaymentDto {
  const RecordInvoicePaymentDto({this.amountCents});

  factory RecordInvoicePaymentDto.fromJson(Map<String, Object?> json) =>
      _$RecordInvoicePaymentDtoFromJson(json);

  /// Amount received outside the app, cents. Without it: the whole balance.
  final num? amountCents;

  Map<String, Object?> toJson() => _$RecordInvoicePaymentDtoToJson(this);
}
