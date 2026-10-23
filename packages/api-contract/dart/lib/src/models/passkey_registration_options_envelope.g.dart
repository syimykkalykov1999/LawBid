// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_registration_options_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyRegistrationOptionsEnvelope _$PasskeyRegistrationOptionsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PasskeyRegistrationOptionsEnvelope(
  data: PasskeyRegistrationOptionsDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PasskeyRegistrationOptionsEnvelopeToJson(
  PasskeyRegistrationOptionsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
