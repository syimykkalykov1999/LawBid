// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consents_saved_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsentsSavedEnvelope _$ConsentsSavedEnvelopeFromJson(
  Map<String, dynamic> json,
) => ConsentsSavedEnvelope(
  data: ConsentsSavedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ConsentsSavedEnvelopeToJson(
  ConsentsSavedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
