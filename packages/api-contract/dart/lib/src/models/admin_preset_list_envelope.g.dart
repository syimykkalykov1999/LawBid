// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_preset_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPresetListEnvelope _$AdminPresetListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPresetListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminPresetDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPresetListEnvelopeToJson(
  AdminPresetListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
