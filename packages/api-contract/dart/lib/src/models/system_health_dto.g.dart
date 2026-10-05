// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'system_health_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SystemHealthDto _$SystemHealthDtoFromJson(Map<String, dynamic> json) =>
    SystemHealthDto(
      overall: SystemHealthDtoOverall.fromJson(json['overall'] as String),
      generatedAt: json['generatedAt'] as String,
      items: (json['items'] as List<dynamic>)
          .map((e) => HealthItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      actions: OpsActionsDto.fromJson(json['actions'] as Map<String, dynamic>),
      settings: OpsSettingsDto.fromJson(
        json['settings'] as Map<String, dynamic>,
      ),
      heavyPause: json['heavyPause'] == null
          ? null
          : HeavyPauseDto.fromJson(json['heavyPause'] as Map<String, dynamic>),
      scaleMode: json['scaleMode'] == null
          ? null
          : ScaleModeDto.fromJson(json['scaleMode'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SystemHealthDtoToJson(SystemHealthDto instance) =>
    <String, dynamic>{
      'overall': instance.overall.toJson(),
      'generatedAt': instance.generatedAt,
      'items': instance.items.map((e) => e.toJson()).toList(),
      'heavyPause': ?instance.heavyPause?.toJson(),
      'scaleMode': ?instance.scaleMode?.toJson(),
      'actions': instance.actions.toJson(),
      'settings': instance.settings.toJson(),
    };
