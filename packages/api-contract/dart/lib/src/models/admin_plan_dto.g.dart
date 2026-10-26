// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plan_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlanDto _$AdminPlanDtoFromJson(Map<String, dynamic> json) => AdminPlanDto(
  id: json['id'] as String,
  code: json['code'] as String,
  audience: AdminPlanDtoAudience.fromJson(json['audience'] as String),
  kind: AdminPlanDtoKind.fromJson(json['kind'] as String),
  name: LocalizedTextDto.fromJson(json['name'] as Map<String, dynamic>),
  tagline: LocalizedTextDto.fromJson(json['tagline'] as Map<String, dynamic>),
  description: LocalizedTextDto.fromJson(
    json['description'] as Map<String, dynamic>,
  ),
  interval: json['interval'] == null
      ? null
      : AdminPlanDtoInterval.fromJson(json['interval'] as String),
  currency: json['currency'] as String,
  amountCents: (json['amountCents'] as num?)?.toInt(),
  extraSeatCents: (json['extraSeatCents'] as num?)?.toInt(),
  discount: json['discount'] == null
      ? null
      : PriceDiscountDto.fromJson(json['discount'] as Map<String, dynamic>),
  entitlements: PlanEntitlementsDto.fromJson(
    json['entitlements'] as Map<String, dynamic>,
  ),
  highlights: (json['highlights'] as List<dynamic>)
      .map((e) => LocalizedTextDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  isDefault: json['isDefault'] as bool,
  trialDays: (json['trialDays'] as num).toInt(),
  status: AdminPlanDtoStatus.fromJson(json['status'] as String),
  sort: (json['sort'] as num).toInt(),
  subscribers: (json['subscribers'] as num).toInt(),
  stripePriceId: json['stripePriceId'] as String?,
  priceKind: json['priceKind'] as String?,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  compareAtCents: (json['compareAtCents'] as num?)?.toInt(),
  showDiscount: json['showDiscount'] as bool,
);

Map<String, dynamic> _$AdminPlanDtoToJson(AdminPlanDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'audience': instance.audience.toJson(),
      'kind': instance.kind.toJson(),
      'name': instance.name.toJson(),
      'tagline': instance.tagline.toJson(),
      'description': instance.description.toJson(),
      'interval': ?instance.interval?.toJson(),
      'currency': instance.currency,
      'amountCents': ?instance.amountCents,
      'extraSeatCents': ?instance.extraSeatCents,
      'discount': ?instance.discount?.toJson(),
      'entitlements': instance.entitlements.toJson(),
      'highlights': instance.highlights.map((e) => e.toJson()).toList(),
      'isDefault': instance.isDefault,
      'trialDays': instance.trialDays,
      'status': instance.status.toJson(),
      'sort': instance.sort,
      'subscribers': instance.subscribers,
      'stripePriceId': ?instance.stripePriceId,
      'priceKind': ?instance.priceKind,
      'updatedAt': instance.updatedAt.toIso8601String(),
      'compareAtCents': ?instance.compareAtCents,
      'showDiscount': instance.showDiscount,
    };
