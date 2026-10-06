// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_legal_version_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLegalVersionEnvelope _$AdminLegalVersionEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminLegalVersionEnvelope(
  data: AdminLegalVersionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminLegalVersionEnvelopeToJson(
  AdminLegalVersionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
