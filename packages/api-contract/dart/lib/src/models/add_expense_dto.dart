// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_expense_dto.g.dart';

@JsonSerializable()
class AddExpenseDto {
  const AddExpenseDto({
    required this.spentOn,
    required this.description,
    required this.amountCents,
    this.receiptFileId,
  });

  factory AddExpenseDto.fromJson(Map<String, Object?> json) =>
      _$AddExpenseDtoFromJson(json);

  final DateTime spentOn;
  final String description;
  final num amountCents;

  /// A receipt photo / PDF (a clean case_photo or case_attachment).
  final String? receiptFileId;

  Map<String, Object?> toJson() => _$AddExpenseDtoToJson(this);
}
