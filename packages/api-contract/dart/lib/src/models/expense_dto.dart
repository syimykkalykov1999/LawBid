// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'expense_dto.g.dart';

@JsonSerializable()
class ExpenseDto {
  const ExpenseDto({
    required this.id,
    required this.spentOn,
    required this.description,
    required this.amountCents,
    required this.receiptUrl,
    required this.receiptPreviewUrl,
    required this.invoiceId,
  });

  factory ExpenseDto.fromJson(Map<String, Object?> json) =>
      _$ExpenseDtoFromJson(json);

  final String id;
  final DateTime spentOn;
  final String description;
  final num amountCents;
  final String? receiptUrl;
  final String? receiptPreviewUrl;
  final String? invoiceId;

  Map<String, Object?> toJson() => _$ExpenseDtoToJson(this);
}
