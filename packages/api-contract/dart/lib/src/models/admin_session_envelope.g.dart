// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_session_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSessionEnvelope _$AdminSessionEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSessionEnvelope(
  data: AdminSessionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSessionEnvelopeToJson(
  AdminSessionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
