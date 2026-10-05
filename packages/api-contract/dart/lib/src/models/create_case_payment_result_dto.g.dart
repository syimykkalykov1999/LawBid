// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_case_payment_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCasePaymentResultDto _$CreateCasePaymentResultDtoFromJson(
  Map<String, dynamic> json,
) => CreateCasePaymentResultDto(
  paymentId: json['paymentId'] as String,
  checkoutUrl: json['checkoutUrl'] as String,
  quote: PaymentQuoteDto.fromJson(json['quote'] as Map<String, dynamic>),
  payment: CasePaymentDto.fromJson(json['payment'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CreateCasePaymentResultDtoToJson(
  CreateCasePaymentResultDto instance,
) => <String, dynamic>{
  'paymentId': instance.paymentId,
  'checkoutUrl': instance.checkoutUrl,
  'quote': instance.quote.toJson(),
  'payment': instance.payment.toJson(),
};
