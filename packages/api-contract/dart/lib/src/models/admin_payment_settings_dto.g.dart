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
  feePercent: json['feePercent'] as num,
  feePayer: PaymentFeePayer.fromJson(json['feePayer'] as String),
  passProcessingFeeToClient: json['passProcessingFeeToClient'] as bool,
  processingFeePercent: json['processingFeePercent'] as num,
  processingFeeFixedCents: (json['processingFeeFixedCents'] as num).toInt(),
  minAmountCents: (json['minAmountCents'] as num).toInt(),
  maxAmountCents: (json['maxAmountCents'] as num).toInt(),
  allowCustomAmount: json['allowCustomAmount'] as bool,
  allowPartial: json['allowPartial'] as bool,
  refundWindowDays: (json['refundWindowDays'] as num).toInt(),
);

Map<String, dynamic> _$AdminPaymentSettingsDtoToJson(
  AdminPaymentSettingsDto instance,
) => <String, dynamic>{
  'feeType': instance.feeType.toJson(),
  'feeFixedCents': instance.feeFixedCents,
  'feePercent': instance.feePercent,
  'feePayer': instance.feePayer.toJson(),
  'passProcessingFeeToClient': instance.passProcessingFeeToClient,
  'processingFeePercent': instance.processingFeePercent,
  'processingFeeFixedCents': instance.processingFeeFixedCents,
  'minAmountCents': instance.minAmountCents,
  'maxAmountCents': instance.maxAmountCents,
  'allowCustomAmount': instance.allowCustomAmount,
  'allowPartial': instance.allowPartial,
  'refundWindowDays': instance.refundWindowDays,
};
