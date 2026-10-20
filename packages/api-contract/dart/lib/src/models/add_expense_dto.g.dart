// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_expense_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddExpenseDto _$AddExpenseDtoFromJson(Map<String, dynamic> json) =>
    AddExpenseDto(
      spentOn: DateTime.parse(json['spentOn'] as String),
      description: json['description'] as String,
      amountCents: json['amountCents'] as num,
      receiptFileId: json['receiptFileId'] as String?,
    );

Map<String, dynamic> _$AddExpenseDtoToJson(AddExpenseDto instance) =>
    <String, dynamic>{
      'spentOn': instance.spentOn.toIso8601String(),
      'description': instance.description,
      'amountCents': instance.amountCents,
      'receiptFileId': ?instance.receiptFileId,
    };
