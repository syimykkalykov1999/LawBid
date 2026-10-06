// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_treasury_expense_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateTreasuryExpenseDto _$CreateTreasuryExpenseDtoFromJson(
  Map<String, dynamic> json,
) => CreateTreasuryExpenseDto(
  name: json['name'] as String,
  monthlyCents: (json['monthlyCents'] as num).toInt(),
);

Map<String, dynamic> _$CreateTreasuryExpenseDtoToJson(
  CreateTreasuryExpenseDto instance,
) => <String, dynamic>{
  'name': instance.name,
  'monthlyCents': instance.monthlyCents,
};
