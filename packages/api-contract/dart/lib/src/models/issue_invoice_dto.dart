// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'issue_invoice_dto.g.dart';

@JsonSerializable()
class IssueInvoiceDto {
  const IssueInvoiceDto({
    this.note,
    this.dueAt,
    this.draft,
    this.remindersEnabled,
    this.payUrl,
  });

  factory IssueInvoiceDto.fromJson(Map<String, Object?> json) =>
      _$IssueInvoiceDtoFromJson(json);

  final String? note;

  /// Due date; without it the admin default (days after sending) applies, or none.
  final DateTime? dueAt;

  /// Keep it a draft: the client sees nothing until it is sent. Default false.
  final bool? draft;

  /// Automatic reminders for this invoice (default true).
  final bool? remindersEnabled;

  /// The attorney's own external payment link (https). The app only shows it; the client pays outside the app.
  final String? payUrl;

  Map<String, Object?> toJson() => _$IssueInvoiceDtoToJson(this);
}
