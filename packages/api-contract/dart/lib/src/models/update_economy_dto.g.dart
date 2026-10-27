// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_economy_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateEconomyDto _$UpdateEconomyDtoFromJson(Map<String, dynamic> json) =>
    UpdateEconomyDto(
      percent: json['percent'] as num?,
      thresholdUsd: json['thresholdUsd'] as num?,
      ceilingMode: json['ceilingMode'] == null
          ? null
          : UpdateEconomyDtoCeilingMode.fromJson(json['ceilingMode'] as String),
      manualApi: json['manualApi'] as num?,
      manualWorker: json['manualWorker'] as num?,
      dailyBrakeDays: json['dailyBrakeDays'] as num?,
      awsFallbackUsd: json['awsFallbackUsd'] as num?,
      guardEnabled: json['guardEnabled'] as bool?,
    );

Map<String, dynamic> _$UpdateEconomyDtoToJson(UpdateEconomyDto instance) =>
    <String, dynamic>{
      'percent': ?instance.percent,
      'thresholdUsd': ?instance.thresholdUsd,
      'ceilingMode': ?instance.ceilingMode?.toJson(),
      'manualApi': ?instance.manualApi,
      'manualWorker': ?instance.manualWorker,
      'dailyBrakeDays': ?instance.dailyBrakeDays,
      'awsFallbackUsd': ?instance.awsFallbackUsd,
      'guardEnabled': ?instance.guardEnabled,
    };
