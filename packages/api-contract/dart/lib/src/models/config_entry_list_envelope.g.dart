// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'config_entry_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfigEntryListEnvelope _$ConfigEntryListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConfigEntryListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ConfigEntryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConfigEntryListEnvelopeToJson(
  ConfigEntryListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
