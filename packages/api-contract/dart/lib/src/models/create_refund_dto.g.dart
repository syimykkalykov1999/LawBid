// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_refund_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateRefundDto _$CreateRefundDtoFromJson(Map<String, dynamic> json) =>
    CreateRefundDto(
      paymentId: json['paymentId'] as String,
      amountCents: (json['amountCents'] as num).toInt(),
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$CreateRefundDtoToJson(CreateRefundDto instance) =>
    <String, dynamic>{
      'reason': instance.reason,
      'paymentId': instance.paymentId,
      'amountCents': instance.amountCents,
    };
