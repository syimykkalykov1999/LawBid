// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_list_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyListItemListEnvelope _$AttorneyListItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AttorneyListItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AttorneyListItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AttorneyListItemListEnvelopeToJson(
  AttorneyListItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
