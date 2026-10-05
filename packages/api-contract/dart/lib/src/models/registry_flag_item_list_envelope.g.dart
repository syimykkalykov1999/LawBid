// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_flag_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryFlagItemListEnvelope _$RegistryFlagItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => RegistryFlagItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => RegistryFlagItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RegistryFlagItemListEnvelopeToJson(
  RegistryFlagItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
