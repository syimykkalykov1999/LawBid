// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_ban_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBanEnvelope _$AdminBanEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminBanEnvelope(
      data: AdminBanDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminBanEnvelopeToJson(AdminBanEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
