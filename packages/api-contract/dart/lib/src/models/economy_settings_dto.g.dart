// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'economy_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EconomySettingsDto _$EconomySettingsDtoFromJson(Map<String, dynamic> json) =>
    EconomySettingsDto(
      percent: json['percent'] as num,
      thresholdUsd: json['thresholdUsd'] as num,
      ceilingMode: EconomySettingsDtoCeilingMode.fromJson(
        json['ceilingMode'] as String,
      ),
      manualApi: json['manualApi'] as num,
      manualWorker: json['manualWorker'] as num,
      awsFallbackUsd: json['awsFallbackUsd'] as num,
      dailyBrakeDays: json['dailyBrakeDays'] as num,
    );

Map<String, dynamic> _$EconomySettingsDtoToJson(EconomySettingsDto instance) =>
    <String, dynamic>{
      'percent': instance.percent,
      'thresholdUsd': instance.thresholdUsd,
      'ceilingMode': instance.ceilingMode.toJson(),
      'manualApi': instance.manualApi,
      'manualWorker': instance.manualWorker,
      'awsFallbackUsd': instance.awsFallbackUsd,
      'dailyBrakeDays': instance.dailyBrakeDays,
    };
