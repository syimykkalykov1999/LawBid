// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_ok_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminOkEnvelope _$AdminOkEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminOkEnvelope(
      data: AdminOkDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminOkEnvelopeToJson(AdminOkEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
