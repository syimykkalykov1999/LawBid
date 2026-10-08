// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'target_pricing_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TargetPricingDto _$TargetPricingDtoFromJson(Map<String, dynamic> json) =>
    TargetPricingDto(
      enabled: json['enabled'] as bool,
      models: BillingModelsDto.fromJson(json['models'] as Map<String, dynamic>),
      actions: (json['actions'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$TargetPricingDtoToJson(TargetPricingDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'models': instance.models.toJson(),
      'actions': instance.actions,
    };
