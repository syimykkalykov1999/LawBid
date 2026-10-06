// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasurySettingsDto _$TreasurySettingsDtoFromJson(Map<String, dynamic> json) =>
    TreasurySettingsDto(
      auto: json['auto'] as bool,
      payoutDay: (json['payoutDay'] as num).toInt(),
      bufferPercent: (json['bufferPercent'] as num).toInt(),
      refundBufferUsd: (json['refundBufferUsd'] as num).toInt(),
      minProfitUsd: (json['minProfitUsd'] as num).toInt(),
      payrollAuto: json['payrollAuto'] as bool,
      payrollDay: (json['payrollDay'] as num).toInt(),
      payrollWarnDays: (json['payrollWarnDays'] as num).toInt(),
    );

Map<String, dynamic> _$TreasurySettingsDtoToJson(
  TreasurySettingsDto instance,
) => <String, dynamic>{
  'auto': instance.auto,
  'payoutDay': instance.payoutDay,
  'bufferPercent': instance.bufferPercent,
  'refundBufferUsd': instance.refundBufferUsd,
  'minProfitUsd': instance.minProfitUsd,
  'payrollAuto': instance.payrollAuto,
  'payrollDay': instance.payrollDay,
  'payrollWarnDays': instance.payrollWarnDays,
};
