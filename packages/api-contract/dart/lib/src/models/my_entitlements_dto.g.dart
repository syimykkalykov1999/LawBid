// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_entitlements_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyEntitlementsDto _$MyEntitlementsDtoFromJson(
  Map<String, dynamic> json,
) => MyEntitlementsDto(
  audience: MyEntitlementsDtoAudience.fromJson(json['audience'] as String),
  source: MyEntitlementsDtoSource.fromJson(json['source'] as String),
  planId: json['planId'] as String?,
  planCode: json['planCode'] as String?,
  planName: LocalizedTextDto.fromJson(json['planName'] as Map<String, dynamic>),
  planHighlights: (json['planHighlights'] as List<dynamic>)
      .map((e) => LocalizedTextDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  isPaid: json['isPaid'] as bool,
  values: PlanEntitlementsDto.fromJson(json['values'] as Map<String, dynamic>),
  seats: json['seats'] == null
      ? null
      : SeatSummaryDto.fromJson(json['seats'] as Map<String, dynamic>),
  catalog: (json['catalog'] as List<dynamic>)
      .map((e) => EntitlementDefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$MyEntitlementsDtoToJson(MyEntitlementsDto instance) =>
    <String, dynamic>{
      'audience': instance.audience.toJson(),
      'source': instance.source.toJson(),
      'planId': ?instance.planId,
      'planCode': ?instance.planCode,
      'planName': instance.planName.toJson(),
      'planHighlights': instance.planHighlights.map((e) => e.toJson()).toList(),
      'isPaid': instance.isPaid,
      'values': instance.values.toJson(),
      'seats': ?instance.seats?.toJson(),
      'catalog': instance.catalog.map((e) => e.toJson()).toList(),
    };
