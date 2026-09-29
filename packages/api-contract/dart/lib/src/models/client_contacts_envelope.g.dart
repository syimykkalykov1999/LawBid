// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_contacts_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientContactsEnvelope _$ClientContactsEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientContactsEnvelope(
  data: ClientContactsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientContactsEnvelopeToJson(
  ClientContactsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
