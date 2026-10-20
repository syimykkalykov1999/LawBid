// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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

  Map<String, Object?> toJson() => _$InvoiceDtoToJson(this);
}
