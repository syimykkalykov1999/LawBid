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
    };
