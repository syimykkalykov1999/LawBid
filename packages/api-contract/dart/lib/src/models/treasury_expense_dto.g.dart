// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_expense_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryExpenseDto _$TreasuryExpenseDtoFromJson(Map<String, dynamic> json) =>
    TreasuryExpenseDto(
      id: json['id'] as String,
      name: json['name'] as String,
      monthlyCents: (json['monthlyCents'] as num).toInt(),
      effectiveCents: (json['effectiveCents'] as num).toInt(),
      source: TreasuryExpenseDtoSource.fromJson(json['source'] as String),
      active: json['active'] as bool,
      sort: (json['sort'] as num).toInt(),
    );

Map<String, dynamic> _$TreasuryExpenseDtoToJson(TreasuryExpenseDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'monthlyCents': instance.monthlyCents,
      'effectiveCents': instance.effectiveCents,
      'source': instance.source.toJson(),
      'active': instance.active,
      'sort': instance.sort,
    };
