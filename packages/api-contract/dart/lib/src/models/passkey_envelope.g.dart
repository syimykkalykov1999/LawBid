// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyEnvelope _$PasskeyEnvelopeFromJson(Map<String, dynamic> json) =>
    PasskeyEnvelope(
      data: PasskeyDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PasskeyEnvelopeToJson(PasskeyEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
