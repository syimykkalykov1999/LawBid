// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_set_plan_price_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSetPlanPriceResultDto _$AdminSetPlanPriceResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminSetPlanPriceResultDto(
  currency: json['currency'] as String,
  mode: AdminSetPlanPriceResultDtoMode.fromJson(json['mode'] as String),
  items: (json['items'] as List<dynamic>)
      .map((e) => AdminPlanPriceItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  history: (json['history'] as List<dynamic>)
      .map((e) => AdminPlanPriceHistoryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  stripeError: json['stripeError'] as String?,
);

Map<String, dynamic> _$AdminSetPlanPriceResultDtoToJson(
  AdminSetPlanPriceResultDto instance,
) => <String, dynamic>{
  'currency': instance.currency,
  'mode': instance.mode.toJson(),
  'items': instance.items.map((e) => e.toJson()).toList(),
  'history': instance.history.map((e) => e.toJson()).toList(),
  'stripeError': ?instance.stripeError,
};
