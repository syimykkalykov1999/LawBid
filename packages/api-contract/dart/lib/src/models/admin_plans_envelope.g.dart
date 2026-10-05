// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plans_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlansEnvelope _$AdminPlansEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminPlansEnvelope(
      data: AdminPlansDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminPlansEnvelopeToJson(AdminPlansEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
