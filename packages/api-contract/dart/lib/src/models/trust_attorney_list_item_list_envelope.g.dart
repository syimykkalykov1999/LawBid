// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_attorney_list_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustAttorneyListItemListEnvelope _$TrustAttorneyListItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => TrustAttorneyListItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => TrustAttorneyListItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TrustAttorneyListItemListEnvelopeToJson(
  TrustAttorneyListItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
