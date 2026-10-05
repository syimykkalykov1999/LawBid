// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payment_settings_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPaymentSettingsViewDto _$AdminPaymentSettingsViewDtoFromJson(
  Map<String, dynamic> json,
) => AdminPaymentSettingsViewDto(
  feeType: PaymentFeeType.fromJson(json['feeType'] as String),
  feeFixedCents: (json['feeFixedCents'] as num).toInt(),
  feePayer: PaymentFeePayer.fromJson(json['feePayer'] as String),
  passProcessingFeeToClient: json['passProcessingFeeToClient'] as bool,
  processingFeePercent: json['processingFeePercent'] as num,
  processingFeeFixedCents: (json['processingFeeFixedCents'] as num).toInt(),
  minAmountCents: (json['minAmountCents'] as num).toInt(),
  maxAmountCents: (json['maxAmountCents'] as num).toInt(),
  allowCustomAmount: json['allowCustomAmount'] as bool,
  allowPartial: json['allowPartial'] as bool,
  refundWindowDays: (json['refundWindowDays'] as num).toInt(),
  disclaimerEn: json['disclaimerEn'] as String,
  disclaimerRu: json['disclaimerRu'] as String,
  flagEnabled: json['flagEnabled'] as bool,
  stripeConfigured: json['stripeConfigured'] as bool,
);

Map<String, dynamic> _$AdminPaymentSettingsViewDtoToJson(
  AdminPaymentSettingsViewDto instance,
) => <String, dynamic>{
  'feeType': instance.feeType.toJson(),
  'feeFixedCents': instance.feeFixedCents,
  'feePayer': instance.feePayer.toJson(),
  'passProcessingFeeToClient': instance.passProcessingFeeToClient,
  'processingFeePercent': instance.processingFeePercent,
  'processingFeeFixedCents': instance.processingFeeFixedCents,
  'minAmountCents': instance.minAmountCents,
  'maxAmountCents': instance.maxAmountCents,
  'allowCustomAmount': instance.allowCustomAmount,
  'allowPartial': instance.allowPartial,
  'refundWindowDays': instance.refundWindowDays,
  'disclaimerEn': instance.disclaimerEn,
  'disclaimerRu': instance.disclaimerRu,
  'flagEnabled': instance.flagEnabled,
  'stripeConfigured': instance.stripeConfigured,
};
