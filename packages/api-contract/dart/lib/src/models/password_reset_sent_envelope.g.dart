// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'password_reset_sent_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasswordResetSentEnvelope _$PasswordResetSentEnvelopeFromJson(
  Map<String, dynamic> json,
) => PasswordResetSentEnvelope(
  data: PasswordResetSentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PasswordResetSentEnvelopeToJson(
  PasswordResetSentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
