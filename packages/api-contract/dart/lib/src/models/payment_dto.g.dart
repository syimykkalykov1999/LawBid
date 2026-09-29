// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentDto _$PaymentDtoFromJson(Map<String, dynamic> json) => PaymentDto(
  id: json['id'] as String,
  amountCents: (json['amountCents'] as num).toInt(),
  currency: json['currency'] as String,
  status: PaymentDtoStatus.fromJson(json['status'] as String),
  paidAt: json['paidAt'] == null
      ? null
      : DateTime.parse(json['paidAt'] as String),
  failureCode: json['failureCode'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$PaymentDtoToJson(PaymentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'status': instance.status.toJson(),
      'paidAt': ?instance.paidAt?.toIso8601String(),
      'failureCode': ?instance.failureCode,
      'createdAt': instance.createdAt.toIso8601String(),
    };
