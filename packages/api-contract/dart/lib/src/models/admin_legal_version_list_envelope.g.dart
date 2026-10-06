// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_version_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalVersionListEnvelope _$AdminLegalVersionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminLegalVersionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminLegalVersionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLegalVersionListEnvelopeToJson(
  AdminLegalVersionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
