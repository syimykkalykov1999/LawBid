// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_settings_public_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentSettingsPublicDto _$PaymentSettingsPublicDtoFromJson(
  Map<String, dynamic> json,
) => PaymentSettingsPublicDto(
  enabled: json['enabled'] as bool,
  feeType: PaymentFeeType.fromJson(json['feeType'] as String),
  feeFixedCents: (json['feeFixedCents'] as num).toInt(),
  feePayer: PaymentFeePayer.fromJson(json['feePayer'] as String),
  processingFeePayer: ProcessingFeePayer.fromJson(
    json['processingFeePayer'] as String,
  ),
  processingFeePercent: json['processingFeePercent'] as num,
  processingFeeFixedCents: (json['processingFeeFixedCents'] as num).toInt(),
  saveCards: json['saveCards'] as bool,
  allowInvoices: json['allowInvoices'] as bool,
  allowInstallments: json['allowInstallments'] as bool,
  maxInstallments: (json['maxInstallments'] as num).toInt(),
  feePayerMaxRounds: (json['feePayerMaxRounds'] as num).toInt(),
  minAmountCents: (json['minAmountCents'] as num).toInt(),
  maxAmountCents: (json['maxAmountCents'] as num).toInt(),
  allowCustomAmount: json['allowCustomAmount'] as bool,
  allowPartial: json['allowPartial'] as bool,
  refundWindowDays: (json['refundWindowDays'] as num).toInt(),
  disclaimerEn: json['disclaimerEn'] as String,
  disclaimerRu: json['disclaimerRu'] as String,
);

Map<String, dynamic> _$PaymentSettingsPublicDtoToJson(
  PaymentSettingsPublicDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'feeType': instance.feeType.toJson(),
  'feeFixedCents': instance.feeFixedCents,
  'feePayer': instance.feePayer.toJson(),
  'processingFeePayer': instance.processingFeePayer.toJson(),
  'processingFeePercent': instance.processingFeePercent,
  'processingFeeFixedCents': instance.processingFeeFixedCents,
  'saveCards': instance.saveCards,
  'allowInvoices': instance.allowInvoices,
  'allowInstallments': instance.allowInstallments,
  'maxInstallments': instance.maxInstallments,
  'feePayerMaxRounds': instance.feePayerMaxRounds,
  'minAmountCents': instance.minAmountCents,
  'maxAmountCents': instance.maxAmountCents,
  'allowCustomAmount': instance.allowCustomAmount,
  'allowPartial': instance.allowPartial,
  'refundWindowDays': instance.refundWindowDays,
  'disclaimerEn': instance.disclaimerEn,
  'disclaimerRu': instance.disclaimerRu,
};
