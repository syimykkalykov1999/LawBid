// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_guards_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraGuardsDto _$InfraGuardsDtoFromJson(Map<String, dynamic> json) =>
    InfraGuardsDto(
      dryRun: json['dryRun'] as bool,
      dailyCap: json['dailyCap'] as num,
      quietHours: json['quietHours'] as String,
      configured: json['configured'] as bool,
      inQuietWindow: json['inQuietWindow'] as bool,
    );

Map<String, dynamic> _$InfraGuardsDtoToJson(InfraGuardsDto instance) =>
    <String, dynamic>{
      'dryRun': instance.dryRun,
      'dailyCap': instance.dailyCap,
      'quietHours': instance.quietHours,
      'configured': instance.configured,
      'inQuietWindow': instance.inQuietWindow,
    };
