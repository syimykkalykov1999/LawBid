// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plan_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlanResultDto _$AdminPlanResultDtoFromJson(Map<String, dynamic> json) =>
    AdminPlanResultDto(
      currency: json['currency'] as String,
      mode: AdminPlanResultDtoMode.fromJson(json['mode'] as String),
      plans: (json['plans'] as List<dynamic>)
          .map((e) => AdminPlanDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      catalog: (json['catalog'] as List<dynamic>)
          .map((e) => EntitlementDefDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      privateLocalized: (json['_localized'] as List<dynamic>)
          .map((e) => LocalizedTextDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      stripeError: json['stripeError'] as String?,
    );

Map<String, dynamic> _$AdminPlanResultDtoToJson(AdminPlanResultDto instance) =>
    <String, dynamic>{
      'currency': instance.currency,
      'mode': instance.mode.toJson(),
      'plans': instance.plans.map((e) => e.toJson()).toList(),
      'catalog': instance.catalog.map((e) => e.toJson()).toList(),
      '_localized': instance.privateLocalized.map((e) => e.toJson()).toList(),
      'stripeError': ?instance.stripeError,
    };
