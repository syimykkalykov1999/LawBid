// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_attorney_profile_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicAttorneyProfileEnvelope _$PublicAttorneyProfileEnvelopeFromJson(
  Map<String, dynamic> json,
) => PublicAttorneyProfileEnvelope(
  data: PublicAttorneyProfileDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PublicAttorneyProfileEnvelopeToJson(
  PublicAttorneyProfileEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
