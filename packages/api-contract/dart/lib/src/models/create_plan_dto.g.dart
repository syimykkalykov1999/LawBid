// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_plan_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePlanDto _$CreatePlanDtoFromJson(
  Map<String, dynamic> json,
) => CreatePlanDto(
  code: json['code'] as String,
  audience: CreatePlanDtoAudience.fromJson(json['audience'] as String),
  interval: CreatePlanDtoInterval.fromJson(json['interval'] as String),
  name: json['name'] == null
      ? null
      : LocalizedTextInputDto.fromJson(json['name'] as Map<String, dynamic>),
  tagline: json['tagline'] == null
      ? null
      : LocalizedTextInputDto.fromJson(json['tagline'] as Map<String, dynamic>),
  description: json['description'] == null
      ? null
      : LongLocalizedTextInputDto.fromJson(
          json['description'] as Map<String, dynamic>,
        ),
  entitlements: json['entitlements'],
  highlights: (json['highlights'] as List<dynamic>?)
      ?.map((e) => LocalizedTextInputDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  amountCents: (json['amountCents'] as num?)?.toInt(),
  compareAtCents: (json['compareAtCents'] as num?)?.toInt(),
  showDiscount: json['showDiscount'] as bool?,
  status: json['status'] == null
      ? null
      : CreatePlanDtoStatus.fromJson(json['status'] as String),
  sort: (json['sort'] as num?)?.toInt(),
  isDefault: json['isDefault'] as bool?,
  note: json['note'] as String?,
  applyNow: json['applyNow'] as bool?,
);

Map<String, dynamic> _$CreatePlanDtoToJson(CreatePlanDto instance) =>
    <String, dynamic>{
      'name': ?instance.name?.toJson(),
      'tagline': ?instance.tagline?.toJson(),
      'description': ?instance.description?.toJson(),
      'entitlements': ?instance.entitlements,
      'highlights': ?instance.highlights?.map((e) => e.toJson()).toList(),
      'amountCents': ?instance.amountCents,
      'compareAtCents': ?instance.compareAtCents,
      'showDiscount': ?instance.showDiscount,
      'status': ?instance.status?.toJson(),
      'sort': ?instance.sort,
      'isDefault': ?instance.isDefault,
      'note': ?instance.note,
      'applyNow': ?instance.applyNow,
      'code': instance.code,
      'audience': instance.audience.toJson(),
      'interval': instance.interval.toJson(),
    };
