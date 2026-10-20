// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'star_ledger_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarLedgerItemListEnvelope _$StarLedgerItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StarLedgerItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StarLedgerItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StarLedgerItemListEnvelopeToJson(
  StarLedgerItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
