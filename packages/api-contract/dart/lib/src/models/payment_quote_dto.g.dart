// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_quote_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentQuoteDto _$PaymentQuoteDtoFromJson(Map<String, dynamic> json) =>
    PaymentQuoteDto(
      amountCents: (json['amountCents'] as num).toInt(),
      platformFeeCents: (json['platformFeeCents'] as num).toInt(),
      processingFeeCents: (json['processingFeeCents'] as num).toInt(),
      clientTotalCents: (json['clientTotalCents'] as num).toInt(),
      attorneyNetCents: (json['attorneyNetCents'] as num).toInt(),
      feeType: PaymentFeeType.fromJson(json['feeType'] as String),
      feePayer: PaymentFeePayer.fromJson(json['feePayer'] as String),
    );

Map<String, dynamic> _$PaymentQuoteDtoToJson(PaymentQuoteDto instance) =>
    <String, dynamic>{
      'amountCents': instance.amountCents,
      'platformFeeCents': instance.platformFeeCents,
      'processingFeeCents': instance.processingFeeCents,
      'clientTotalCents': instance.clientTotalCents,
      'attorneyNetCents': instance.attorneyNetCents,
      'feeType': instance.feeType.toJson(),
      'feePayer': instance.feePayer.toJson(),
    };
