// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminMeEnvelope _$AdminMeEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminMeEnvelope(
      data: AdminMeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminMeEnvelopeToJson(AdminMeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
