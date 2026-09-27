// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_verified_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactVerifiedEnvelope _$ContactVerifiedEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContactVerifiedEnvelope(
  data: ContactVerifiedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContactVerifiedEnvelopeToJson(
  ContactVerifiedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
