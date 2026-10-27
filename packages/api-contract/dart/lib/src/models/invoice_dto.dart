// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'invoice_dto_status.dart';
import 'invoice_line_dto.dart';

part 'invoice_dto.g.dart';

@JsonSerializable()
class InvoiceDto {
  const InvoiceDto({
    required this.id,
    required this.number,
    required this.createdAt,
    required this.currency,
    required this.minutes,
    required this.timeCents,
    required this.expensesCents,
    required this.totalCents,
    required this.note,
    required this.lines,
    required this.url,
    required this.fileId,
    required this.status,
    required this.dueAt,
    required this.sentAt,
    required this.viewedAt,
    required this.paidAt,
    required this.paidCents,
    required this.lateFeeCents,
    required this.balanceCents,
    required this.remindersEnabled,
    required this.payUrl,
  });

  factory InvoiceDto.fromJson(Map<String, Object?> json) =>
      _$InvoiceDtoFromJson(json);

  final String id;
  final String number;
  final DateTime createdAt;
  final String currency;
  final num minutes;
  final num timeCents;
  final num expensesCents;
  final num totalCents;
  final String? note;
  final List<InvoiceLineDto> lines;

  /// The PDF (a case file).
  final String? url;
  final String fileId;
  final InvoiceDtoStatus status;
  final DateTime? dueAt;
  final DateTime? sentAt;
  final DateTime? viewedAt;
  final DateTime? paidAt;

  /// Paid so far, cents.
  final num paidCents;

  /// Late fee added, cents (0 = none).
  final num lateFeeCents;

  /// Still owed: total + late fee - paid.
  final num balanceCents;
  final bool remindersEnabled;

  /// The attorney's own external payment link (never an in-app payment).
  final String? payUrl;

  Map<String, Object?> toJson() => _$InvoiceDtoToJson(this);
}
