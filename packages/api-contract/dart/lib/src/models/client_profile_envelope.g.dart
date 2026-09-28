// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_profile_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientProfileEnvelope _$ClientProfileEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientProfileEnvelope(
  data: ClientProfileDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientProfileEnvelopeToJson(
  ClientProfileEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
