// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'refund_case_payment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RefundCasePaymentDto _$RefundCasePaymentDtoFromJson(
  Map<String, dynamic> json,
) => RefundCasePaymentDto(
  reason: json['reason'] as String,
  amountCents: (json['amountCents'] as num?)?.toInt(),
);

Map<String, dynamic> _$RefundCasePaymentDtoToJson(
  RefundCasePaymentDto instance,
) => <String, dynamic>{
  'amountCents': ?instance.amountCents,
  'reason': instance.reason,
};
