// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'custody_entry_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CustodyEntryListEnvelope _$CustodyEntryListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CustodyEntryListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CustodyEntryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CustodyEntryListEnvelopeToJson(
  CustodyEntryListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
