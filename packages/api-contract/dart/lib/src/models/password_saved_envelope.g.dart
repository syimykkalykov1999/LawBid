// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'password_saved_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasswordSavedEnvelope _$PasswordSavedEnvelopeFromJson(
  Map<String, dynamic> json,
) => PasswordSavedEnvelope(
  data: PasswordSavedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PasswordSavedEnvelopeToJson(
  PasswordSavedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
