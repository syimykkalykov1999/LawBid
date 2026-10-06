// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_treasury_expense_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTreasuryExpenseDto _$UpdateTreasuryExpenseDtoFromJson(
  Map<String, dynamic> json,
) => UpdateTreasuryExpenseDto(
  name: json['name'] as String?,
  monthlyCents: (json['monthlyCents'] as num?)?.toInt(),
  active: json['active'] as bool?,
);

Map<String, dynamic> _$UpdateTreasuryExpenseDtoToJson(
  UpdateTreasuryExpenseDto instance,
) => <String, dynamic>{
  'name': ?instance.name,
  'monthlyCents': ?instance.monthlyCents,
  'active': ?instance.active,
};
