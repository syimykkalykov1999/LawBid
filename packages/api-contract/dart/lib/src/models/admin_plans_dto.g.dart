// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plans_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlansDto _$AdminPlansDtoFromJson(Map<String, dynamic> json) =>
    AdminPlansDto(
      currency: json['currency'] as String,
      mode: AdminPlansDtoMode.fromJson(json['mode'] as String),
      plans: (json['plans'] as List<dynamic>)
          .map((e) => AdminPlanDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      catalog: (json['catalog'] as List<dynamic>)
          .map((e) => EntitlementDefDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      privateLocalized: (json['_localized'] as List<dynamic>)
          .map((e) => LocalizedTextDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AdminPlansDtoToJson(AdminPlansDto instance) =>
    <String, dynamic>{
      'currency': instance.currency,
      'mode': instance.mode.toJson(),
      'plans': instance.plans.map((e) => e.toJson()).toList(),
      'catalog': instance.catalog.map((e) => e.toJson()).toList(),
      '_localized': instance.privateLocalized.map((e) => e.toJson()).toList(),
    };
