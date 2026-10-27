// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'invoice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InvoiceDto _$InvoiceDtoFromJson(Map<String, dynamic> json) => InvoiceDto(
  id: json['id'] as String,
  number: json['number'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  currency: json['currency'] as String,
  minutes: json['minutes'] as num,
  timeCents: json['timeCents'] as num,
  expensesCents: json['expensesCents'] as num,
  totalCents: json['totalCents'] as num,
  note: json['note'] as String?,
  lines: (json['lines'] as List<dynamic>)
      .map((e) => InvoiceLineDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  url: json['url'] as String?,
  fileId: json['fileId'] as String,
  status: InvoiceDtoStatus.fromJson(json['status'] as String),
  dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt'] as String),
  sentAt: json['sentAt'] == null
      ? null
      : DateTime.parse(json['sentAt'] as String),
  viewedAt: json['viewedAt'] == null
      ? null
      : DateTime.parse(json['viewedAt'] as String),
  paidAt: json['paidAt'] == null
      ? null
      : DateTime.parse(json['paidAt'] as String),
  paidCents: json['paidCents'] as num,
  lateFeeCents: json['lateFeeCents'] as num,
  balanceCents: json['balanceCents'] as num,
  remindersEnabled: json['remindersEnabled'] as bool,
  payUrl: json['payUrl'] as String?,
);

Map<String, dynamic> _$InvoiceDtoToJson(InvoiceDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'number': instance.number,
      'createdAt': instance.createdAt.toIso8601String(),
      'currency': instance.currency,
      'minutes': instance.minutes,
      'timeCents': instance.timeCents,
      'expensesCents': instance.expensesCents,
      'totalCents': instance.totalCents,
      'note': ?instance.note,
      'lines': instance.lines.map((e) => e.toJson()).toList(),
      'url': ?instance.url,
      'fileId': instance.fileId,
      'status': instance.status.toJson(),
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'sentAt': ?instance.sentAt?.toIso8601String(),
      'viewedAt': ?instance.viewedAt?.toIso8601String(),
      'paidAt': ?instance.paidAt?.toIso8601String(),
      'paidCents': instance.paidCents,
      'lateFeeCents': instance.lateFeeCents,
      'balanceCents': instance.balanceCents,
      'remindersEnabled': instance.remindersEnabled,
      'payUrl': ?instance.payUrl,
    };
