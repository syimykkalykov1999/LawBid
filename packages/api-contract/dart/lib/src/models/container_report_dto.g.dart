// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'container_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContainerReportDto _$ContainerReportDtoFromJson(Map<String, dynamic> json) =>
    ContainerReportDto(
      hardCap: json['hardCap'] as num,
      taskUsd: json['taskUsd'] as num,
      running: json['running'] as num?,
      desired: json['desired'] as num?,
      ceiling: json['ceiling'] as num?,
    );

Map<String, dynamic> _$ContainerReportDtoToJson(ContainerReportDto instance) =>
    <String, dynamic>{
      'running': ?instance.running,
      'desired': ?instance.desired,
      'ceiling': ?instance.ceiling,
      'hardCap': instance.hardCap,
      'taskUsd': instance.taskUsd,
    };
