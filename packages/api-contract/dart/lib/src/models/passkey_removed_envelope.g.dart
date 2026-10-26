// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_removed_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyRemovedEnvelope _$PasskeyRemovedEnvelopeFromJson(
  Map<String, dynamic> json,
) => PasskeyRemovedEnvelope(
  data: PasskeyRemovedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PasskeyRemovedEnvelopeToJson(
  PasskeyRemovedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
