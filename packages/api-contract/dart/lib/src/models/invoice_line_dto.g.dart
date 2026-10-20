// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'invoice_line_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InvoiceLineDto _$InvoiceLineDtoFromJson(Map<String, dynamic> json) =>
    InvoiceLineDto(
      kind: InvoiceLineDtoKind.fromJson(json['kind'] as String),
      date: DateTime.parse(json['date'] as String),
      text: json['text'] as String,
      cents: json['cents'] as num,
      minutes: json['minutes'] as num?,
      rateCents: json['rateCents'] as num?,
    );

Map<String, dynamic> _$InvoiceLineDtoToJson(InvoiceLineDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'date': instance.date.toIso8601String(),
      'text': instance.text,
      'minutes': ?instance.minutes,
      'rateCents': ?instance.rateCents,
      'cents': instance.cents,
    };
