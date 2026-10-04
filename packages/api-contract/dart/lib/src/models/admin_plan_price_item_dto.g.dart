// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plan_price_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlanPriceItemDto _$AdminPlanPriceItemDtoFromJson(
  Map<String, dynamic> json,
) => AdminPlanPriceItemDto(
  kind: PlanKind.fromJson(json['kind'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  defaultCents: (json['defaultCents'] as num).toInt(),
  isCustom: json['isCustom'] as bool,
  interval: AdminPlanPriceItemDtoInterval.fromJson(json['interval'] as String),
  stripePriceId: json['stripePriceId'] as String?,
  subscribers: (json['subscribers'] as num).toInt(),
  updatedAt: json['updatedAt'] == null
      ? null
      : DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$AdminPlanPriceItemDtoToJson(
  AdminPlanPriceItemDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'amountCents': instance.amountCents,
  'defaultCents': instance.defaultCents,
  'isCustom': instance.isCustom,
  'interval': instance.interval.toJson(),
  'stripePriceId': ?instance.stripePriceId,
  'subscribers': instance.subscribers,
  'updatedAt': ?instance.updatedAt?.toIso8601String(),
};
