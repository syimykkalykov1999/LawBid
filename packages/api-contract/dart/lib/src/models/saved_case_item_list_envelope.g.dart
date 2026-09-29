// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_case_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedCaseItemListEnvelope _$SavedCaseItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SavedCaseItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SavedCaseItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SavedCaseItemListEnvelopeToJson(
  SavedCaseItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
