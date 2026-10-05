// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payroll_fee_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayrollFeeSettingsDto _$PayrollFeeSettingsDtoFromJson(
  Map<String, dynamic> json,
) => PayrollFeeSettingsDto(
  percent: json['percent'] as num,
  fixedCents: (json['fixedCents'] as num).toInt(),
  monthlyCents: (json['monthlyCents'] as num).toInt(),
);

Map<String, dynamic> _$PayrollFeeSettingsDtoToJson(
  PayrollFeeSettingsDto instance,
) => <String, dynamic>{
  'percent': instance.percent,
  'fixedCents': instance.fixedCents,
  'monthlyCents': instance.monthlyCents,
};
