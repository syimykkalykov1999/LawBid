// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_tokens_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuthTokensEnvelope _$AuthTokensEnvelopeFromJson(Map<String, dynamic> json) =>
    AuthTokensEnvelope(
      data: AuthTokensDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AuthTokensEnvelopeToJson(AuthTokensEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
