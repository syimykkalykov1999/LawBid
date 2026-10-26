// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payment_refund_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentRefundDto _$CasePaymentRefundDtoFromJson(
  Map<String, dynamic> json,
) => CasePaymentRefundDto(
  id: json['id'] as String,
  paymentId: json['paymentId'] as String,
  amountCents: (json['amountCents'] as num).toInt(),
  reason: json['reason'] as String,
  initiatedByType: CasePaymentRefundDtoInitiatedByType.fromJson(
    json['initiatedByType'] as String,
  ),
  status: CasePaymentRefundDtoStatus.fromJson(json['status'] as String),
  failureReason: json['failureReason'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$CasePaymentRefundDtoToJson(
  CasePaymentRefundDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'paymentId': instance.paymentId,
  'amountCents': instance.amountCents,
  'reason': instance.reason,
  'initiatedByType': instance.initiatedByType.toJson(),
  'status': instance.status.toJson(),
  'failureReason': ?instance.failureReason,
  'createdAt': instance.createdAt.toIso8601String(),
};
