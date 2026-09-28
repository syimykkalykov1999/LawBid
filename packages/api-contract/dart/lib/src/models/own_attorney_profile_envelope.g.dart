// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'own_attorney_profile_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnAttorneyProfileEnvelope _$OwnAttorneyProfileEnvelopeFromJson(
  Map<String, dynamic> json,
) => OwnAttorneyProfileEnvelope(
  data: OwnAttorneyProfileDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OwnAttorneyProfileEnvelopeToJson(
  OwnAttorneyProfileEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
