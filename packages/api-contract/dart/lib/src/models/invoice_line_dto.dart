// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'invoice_line_dto_kind.dart';

part 'invoice_line_dto.g.dart';

@JsonSerializable()
class InvoiceLineDto {
  const InvoiceLineDto({
    required this.kind,
    required this.date,
    required this.text,
    required this.cents,
    this.minutes,
    this.rateCents,
  });

  factory InvoiceLineDto.fromJson(Map<String, Object?> json) =>
      _$InvoiceLineDtoFromJson(json);

  final InvoiceLineDtoKind kind;
  final DateTime date;
  final String text;
  final num? minutes;
  final num? rateCents;
  final num cents;

  Map<String, Object?> toJson() => _$InvoiceLineDtoToJson(this);
}
