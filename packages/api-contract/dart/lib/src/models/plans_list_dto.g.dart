// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plans_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlansListDto _$PlansListDtoFromJson(Map<String, dynamic> json) => PlansListDto(
  audience: PlansListDtoAudience.fromJson(json['audience'] as String),
  plans: (json['plans'] as List<dynamic>)
      .map((e) => PublicPlanDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  baseline: json['baseline'] == null
      ? null
      : PublicPlanDto.fromJson(json['baseline'] as Map<String, dynamic>),
  catalog: (json['catalog'] as List<dynamic>)
      .map((e) => EntitlementDefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PlansListDtoToJson(PlansListDto instance) =>
    <String, dynamic>{
      'audience': instance.audience.toJson(),
      'plans': instance.plans.map((e) => e.toJson()).toList(),
      'baseline': ?instance.baseline?.toJson(),
      'catalog': instance.catalog.map((e) => e.toJson()).toList(),
    };
