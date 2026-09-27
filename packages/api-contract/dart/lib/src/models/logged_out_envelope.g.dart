// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'logged_out_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LoggedOutEnvelope _$LoggedOutEnvelopeFromJson(Map<String, dynamic> json) =>
    LoggedOutEnvelope(
      data: LoggedOutDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LoggedOutEnvelopeToJson(LoggedOutEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
