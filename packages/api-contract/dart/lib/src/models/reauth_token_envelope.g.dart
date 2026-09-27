// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reauth_token_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReauthTokenEnvelope _$ReauthTokenEnvelopeFromJson(Map<String, dynamic> json) =>
    ReauthTokenEnvelope(
      data: ReauthTokenDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReauthTokenEnvelopeToJson(
  ReauthTokenEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
