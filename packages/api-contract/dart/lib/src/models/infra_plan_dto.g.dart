// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_plan_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraPlanDto _$InfraPlanDtoFromJson(Map<String, dynamic> json) => InfraPlanDto(
  add: json['add'] as num,
  change: json['change'] as num,
  destroy: json['destroy'] as num,
  resources: (json['resources'] as List<dynamic>)
      .map((e) => InfraPlanResourceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$InfraPlanDtoToJson(InfraPlanDto instance) =>
    <String, dynamic>{
      'add': instance.add,
      'change': instance.change,
      'destroy': instance.destroy,
      'resources': instance.resources.map((e) => e.toJson()).toList(),
    };
