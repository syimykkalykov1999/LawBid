// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_treasury_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTreasurySettingsDto _$UpdateTreasurySettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateTreasurySettingsDto(
  auto: json['auto'] as bool?,
  payoutDay: (json['payoutDay'] as num?)?.toInt(),
  bufferPercent: (json['bufferPercent'] as num?)?.toInt(),
  refundBufferUsd: (json['refundBufferUsd'] as num?)?.toInt(),
  minProfitUsd: (json['minProfitUsd'] as num?)?.toInt(),
);

Map<String, dynamic> _$UpdateTreasurySettingsDtoToJson(
  UpdateTreasurySettingsDto instance,
) => <String, dynamic>{
  'auto': ?instance.auto,
  'payoutDay': ?instance.payoutDay,
  'bufferPercent': ?instance.bufferPercent,
  'refundBufferUsd': ?instance.refundBufferUsd,
  'minProfitUsd': ?instance.minProfitUsd,
};
