// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_dto.dart';
import 'payment_quote_dto.dart';

part 'create_case_payment_result_dto.g.dart';

@JsonSerializable()
class CreateCasePaymentResultDto {
  const CreateCasePaymentResultDto({
    required this.paymentId,
    required this.checkoutUrl,
    required this.quote,
    required this.payment,
  });

  factory CreateCasePaymentResultDto.fromJson(Map<String, Object?> json) =>
      _$CreateCasePaymentResultDtoFromJson(json);

  final String paymentId;

  /// Stripe Checkout page to open in a browser.
  final String checkoutUrl;
  final PaymentQuoteDto quote;
  final CasePaymentDto payment;

  Map<String, Object?> toJson() => _$CreateCasePaymentResultDtoToJson(this);
}
