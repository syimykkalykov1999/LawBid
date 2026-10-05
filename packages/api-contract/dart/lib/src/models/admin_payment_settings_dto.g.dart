// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payment_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPaymentSettingsDto _$AdminPaymentSettingsDtoFromJson(
  Map<String, dynamic> json,
) => AdminPaymentSettingsDto(
  feeType: PaymentFeeType.fromJson(json['feeType'] as String),
  feeFixedCents: (json['feeFixedCents'] as num).toInt(),
  feePayer: PaymentFeePayer.fromJson(json['feePayer'] as String),
  processingFeePayer: ProcessingFeePayer.fromJson(
    json['processingFeePayer'] as String,
  ),
  processingFeePercent: json['processingFeePercent'] as num,
  processingFeeFixedCents: (json['processingFeeFixedCents'] as num).toInt(),
  minAmountCents: (json['minAmountCents'] as num).toInt(),
  maxAmountCents: (json['maxAmountCents'] as num).toInt(),
  allowCustomAmount: json['allowCustomAmount'] as bool,
  allowPartial: json['allowPartial'] as bool,
  refundWindowDays: (json['refundWindowDays'] as num).toInt(),
  saveCards: json['saveCards'] as bool,
  allowInvoices: json['allowInvoices'] as bool,
  allowInstallments: json['allowInstallments'] as bool,
  maxInstallments: (json['maxInstallments'] as num).toInt(),
  feePayerMaxRounds: (json['feePayerMaxRounds'] as num).toInt(),
  invoiceReminderDays: (json['invoiceReminderDays'] as List<dynamic>)
      .map((e) => e as num)
      .toList(),
  overdueReminderEveryDays: (json['overdueReminderEveryDays'] as num).toInt(),
  invoiceExpireDays: (json['invoiceExpireDays'] as num).toInt(),
  disclaimerEn: json['disclaimerEn'] as String,
  disclaimerRu: json['disclaimerRu'] as String,
);

Map<String, dynamic> _$AdminPaymentSettingsDtoToJson(
  AdminPaymentSettingsDto instance,
) => <String, dynamic>{
  'feeType': instance.feeType.toJson(),
  'feeFixedCents': instance.feeFixedCents,
  'feePayer': instance.feePayer.toJson(),
  'processingFeePayer': instance.processingFeePayer.toJson(),
  'processingFeePercent': instance.processingFeePercent,
  'processingFeeFixedCents': instance.processingFeeFixedCents,
  'minAmountCents': instance.minAmountCents,
  'maxAmountCents': instance.maxAmountCents,
  'allowCustomAmount': instance.allowCustomAmount,
  'allowPartial': instance.allowPartial,
  'refundWindowDays': instance.refundWindowDays,
  'saveCards': instance.saveCards,
  'allowInvoices': instance.allowInvoices,
  'allowInstallments': instance.allowInstallments,
  'maxInstallments': instance.maxInstallments,
  'feePayerMaxRounds': instance.feePayerMaxRounds,
  'invoiceReminderDays': instance.invoiceReminderDays,
  'overdueReminderEveryDays': instance.overdueReminderEveryDays,
  'invoiceExpireDays': instance.invoiceExpireDays,
  'disclaimerEn': instance.disclaimerEn,
  'disclaimerRu': instance.disclaimerRu,
};
