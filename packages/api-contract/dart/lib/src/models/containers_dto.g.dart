// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'containers_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContainersDto _$ContainersDtoFromJson(Map<String, dynamic> json) =>
    ContainersDto(
      onAws: json['onAws'] as bool,
      api: ContainerReportDto.fromJson(json['api'] as Map<String, dynamic>),
      worker: ContainerReportDto.fromJson(
        json['worker'] as Map<String, dynamic>,
      ),
      scaleMode: json['scaleMode'] == null
          ? null
          : ContainersDtoScaleMode.fromJson(json['scaleMode'] as String),
    );

Map<String, dynamic> _$ContainersDtoToJson(ContainersDto instance) =>
    <String, dynamic>{
      'onAws': instance.onAws,
      'api': instance.api.toJson(),
      'worker': instance.worker.toJson(),
      'scaleMode': ?instance.scaleMode?.toJson(),
    };
