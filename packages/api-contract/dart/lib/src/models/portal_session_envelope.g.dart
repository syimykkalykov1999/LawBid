// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'portal_session_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PortalSessionEnvelope _$PortalSessionEnvelopeFromJson(
  Map<String, dynamic> json,
) => PortalSessionEnvelope(
  data: PortalSessionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PortalSessionEnvelopeToJson(
  PortalSessionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
