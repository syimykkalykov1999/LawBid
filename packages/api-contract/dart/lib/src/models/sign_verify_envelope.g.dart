// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_verify_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignVerifyEnvelope _$SignVerifyEnvelopeFromJson(Map<String, dynamic> json) =>
    SignVerifyEnvelope(
      data: SignVerifyDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SignVerifyEnvelopeToJson(SignVerifyEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
