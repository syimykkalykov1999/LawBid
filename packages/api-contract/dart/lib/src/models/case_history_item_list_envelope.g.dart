// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryItemListEnvelope _$CaseHistoryItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseHistoryItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseHistoryItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseHistoryItemListEnvelopeToJson(
  CaseHistoryItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
