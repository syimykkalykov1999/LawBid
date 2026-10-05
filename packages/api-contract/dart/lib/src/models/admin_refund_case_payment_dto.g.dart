// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_refund_case_payment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRefundCasePaymentDto _$AdminRefundCasePaymentDtoFromJson(
  Map<String, dynamic> json,
) => AdminRefundCasePaymentDto(
  reason: json['reason'] as String,
  amountCents: (json['amountCents'] as num?)?.toInt(),
);

Map<String, dynamic> _$AdminRefundCasePaymentDtoToJson(
  AdminRefundCasePaymentDto instance,
) => <String, dynamic>{
  'amountCents': ?instance.amountCents,
  'reason': instance.reason,
};
