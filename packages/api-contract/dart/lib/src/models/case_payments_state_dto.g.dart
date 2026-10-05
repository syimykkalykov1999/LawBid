// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payments_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentsStateDto _$CasePaymentsStateDtoFromJson(
  Map<String, dynamic> json,
) => CasePaymentsStateDto(
  enabled: json['enabled'] as bool,
  attorneyReady: json['attorneyReady'] as bool,
  canPay: json['canPay'] as bool,
  bidAmountCents: (json['bidAmountCents'] as num?)?.toInt(),
  paidCents: (json['paidCents'] as num).toInt(),
  refundedCents: (json['refundedCents'] as num).toInt(),
  remainingCents: (json['remainingCents'] as num?)?.toInt(),
  minAmountCents: (json['minAmountCents'] as num).toInt(),
  maxAmountCents: (json['maxAmountCents'] as num).toInt(),
  allowCustomAmount: json['allowCustomAmount'] as bool,
  allowPartial: json['allowPartial'] as bool,
  items: (json['items'] as List<dynamic>)
      .map((e) => CasePaymentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CasePaymentsStateDtoToJson(
  CasePaymentsStateDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'attorneyReady': instance.attorneyReady,
  'canPay': instance.canPay,
  'bidAmountCents': ?instance.bidAmountCents,
  'paidCents': instance.paidCents,
  'refundedCents': instance.refundedCents,
  'remainingCents': ?instance.remainingCents,
  'minAmountCents': instance.minAmountCents,
  'maxAmountCents': instance.maxAmountCents,
  'allowCustomAmount': instance.allowCustomAmount,
  'allowPartial': instance.allowPartial,
  'items': instance.items.map((e) => e.toJson()).toList(),
};
