// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_session_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppSessionEnvelope _$AppSessionEnvelopeFromJson(Map<String, dynamic> json) =>
    AppSessionEnvelope(
      data: AppSessionDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AppSessionEnvelopeToJson(AppSessionEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
