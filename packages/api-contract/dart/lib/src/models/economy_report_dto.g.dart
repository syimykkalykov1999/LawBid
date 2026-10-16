// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'economy_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EconomyReportDto _$EconomyReportDtoFromJson(Map<String, dynamic> json) =>
    EconomyReportDto(
      enabled: json['enabled'] as bool,
      guard: EconomyReportDtoGuard.fromJson(json['guard'] as String),
      figures: EconomyFiguresDto.fromJson(
        json['figures'] as Map<String, dynamic>,
      ),
      settings: EconomySettingsDto.fromJson(
        json['settings'] as Map<String, dynamic>,
      ),
      containers: ContainersDto.fromJson(
        json['containers'] as Map<String, dynamic>,
      ),
      capacity: CapacityDto.fromJson(json['capacity'] as Map<String, dynamic>),
      events: (json['events'] as List<dynamic>)
          .map((e) => EconomyEventDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      since: json['since'] as String?,
    );

Map<String, dynamic> _$EconomyReportDtoToJson(EconomyReportDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'guard': instance.guard.toJson(),
      'since': ?instance.since,
      'figures': instance.figures.toJson(),
      'settings': instance.settings.toJson(),
      'containers': instance.containers.toJson(),
      'capacity': instance.capacity.toJson(),
      'events': instance.events.map((e) => e.toJson()).toList(),
    };
