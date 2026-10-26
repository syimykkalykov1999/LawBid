// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'expense_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExpenseDto _$ExpenseDtoFromJson(Map<String, dynamic> json) => ExpenseDto(
  id: json['id'] as String,
  spentOn: DateTime.parse(json['spentOn'] as String),
  description: json['description'] as String,
  amountCents: json['amountCents'] as num,
  receiptUrl: json['receiptUrl'] as String?,
  receiptPreviewUrl: json['receiptPreviewUrl'] as String?,
  invoiceId: json['invoiceId'] as String?,
);

Map<String, dynamic> _$ExpenseDtoToJson(ExpenseDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'spentOn': instance.spentOn.toIso8601String(),
      'description': instance.description,
      'amountCents': instance.amountCents,
      'receiptUrl': ?instance.receiptUrl,
      'receiptPreviewUrl': ?instance.receiptPreviewUrl,
      'invoiceId': ?instance.invoiceId,
    };
