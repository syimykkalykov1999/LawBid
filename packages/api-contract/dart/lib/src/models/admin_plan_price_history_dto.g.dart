// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plan_price_history_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlanPriceHistoryDto _$AdminPlanPriceHistoryDtoFromJson(
  Map<String, dynamic> json,
) => AdminPlanPriceHistoryDto(
  id: json['id'] as String,
  kind: PlanKind.fromJson(json['kind'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  active: json['active'] as bool,
  note: json['note'] as String?,
  createdBy: json['createdBy'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminPlanPriceHistoryDtoToJson(
  AdminPlanPriceHistoryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'amountCents': instance.amountCents,
  'active': instance.active,
  'note': ?instance.note,
  'createdBy': ?instance.createdBy,
  'createdAt': instance.createdAt.toIso8601String(),
};
