// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPaymentDto _$AdminPaymentDtoFromJson(Map<String, dynamic> json) =>
    AdminPaymentDto(
      id: json['id'] as String,
      userId: json['userId'] as String,
      user: json['user'] == null
          ? null
          : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String,
      status: PaymentStatus.fromJson(json['status'] as String),
      paidAt: json['paidAt'] == null
          ? null
          : DateTime.parse(json['paidAt'] as String),
      failureCode: json['failureCode'] as String?,
      stripeInvoiceId: json['stripeInvoiceId'] as String?,
      stripePaymentIntentId: json['stripePaymentIntentId'] as String?,
      refundedCents: (json['refundedCents'] as num).toInt(),
      refundableCents: (json['refundableCents'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminPaymentDtoToJson(AdminPaymentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'user': ?instance.user?.toJson(),
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'status': instance.status.toJson(),
      'paidAt': ?instance.paidAt?.toIso8601String(),
      'failureCode': ?instance.failureCode,
      'stripeInvoiceId': ?instance.stripeInvoiceId,
      'stripePaymentIntentId': ?instance.stripePaymentIntentId,
      'refundedCents': instance.refundedCents,
      'refundableCents': instance.refundableCents,
      'createdAt': instance.createdAt.toIso8601String(),
    };
