// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_authentication_options_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyAuthenticationOptionsEnvelope
_$PasskeyAuthenticationOptionsEnvelopeFromJson(Map<String, dynamic> json) =>
    PasskeyAuthenticationOptionsEnvelope(
      data: PasskeyAuthenticationOptionsDto.fromJson(
        json['data'] as Map<String, dynamic>,
      ),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PasskeyAuthenticationOptionsEnvelopeToJson(
  PasskeyAuthenticationOptionsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
