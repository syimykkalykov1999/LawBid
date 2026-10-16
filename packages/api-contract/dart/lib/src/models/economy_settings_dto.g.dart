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
      smsUnitUsd: json['smsUnitUsd'] as num,
      videoUnitUsd: json['videoUnitUsd'] as num,
      translateUnitUsd: json['translateUnitUsd'] as num,
      awsFallbackUsd: json['awsFallbackUsd'] as num,
    );

Map<String, dynamic> _$EconomySettingsDtoToJson(EconomySettingsDto instance) =>
    <String, dynamic>{
      'percent': instance.percent,
      'thresholdUsd': instance.thresholdUsd,
      'ceilingMode': instance.ceilingMode.toJson(),
      'manualApi': instance.manualApi,
      'manualWorker': instance.manualWorker,
      'smsUnitUsd': instance.smsUnitUsd,
      'videoUnitUsd': instance.videoUnitUsd,
      'translateUnitUsd': instance.translateUnitUsd,
      'awsFallbackUsd': instance.awsFallbackUsd,
    };
