// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'issue_invoice_dto.g.dart';

@JsonSerializable()
class IssueInvoiceDto {
  const IssueInvoiceDto({this.note});

  factory IssueInvoiceDto.fromJson(Map<String, Object?> json) =>
      _$IssueInvoiceDtoFromJson(json);

  final String? note;

  Map<String, Object?> toJson() => _$IssueInvoiceDtoToJson(this);
}
