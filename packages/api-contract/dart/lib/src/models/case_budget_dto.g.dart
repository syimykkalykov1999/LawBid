// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_budget_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseBudgetDto _$CaseBudgetDtoFromJson(Map<String, dynamic> json) =>
    CaseBudgetDto(
      mode: BudgetMode.fromJson(json['mode'] as String),
      amountCents: (json['amountCents'] as num?)?.toInt(),
    );

Map<String, dynamic> _$CaseBudgetDtoToJson(CaseBudgetDto instance) =>
    <String, dynamic>{
      'mode': instance.mode.toJson(),
      'amountCents': ?instance.amountCents,
    };
