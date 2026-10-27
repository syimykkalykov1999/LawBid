// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'issue_invoice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IssueInvoiceDto _$IssueInvoiceDtoFromJson(Map<String, dynamic> json) =>
    IssueInvoiceDto(
      note: json['note'] as String?,
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      draft: json['draft'] as bool?,
      remindersEnabled: json['remindersEnabled'] as bool?,
      payUrl: json['payUrl'] as String?,
    );

Map<String, dynamic> _$IssueInvoiceDtoToJson(IssueInvoiceDto instance) =>
    <String, dynamic>{
      'note': ?instance.note,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'draft': ?instance.draft,
      'remindersEnabled': ?instance.remindersEnabled,
      'payUrl': ?instance.payUrl,
    };
